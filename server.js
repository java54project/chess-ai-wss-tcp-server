const { WebSocketServer } = require("ws");
const net = require("net");
const fs = require("fs");
const logger = require("./src/utils/logger"); // Logger module

const retryReconnectInterval = 5000; // Retry connection interval
const connectionTryTimeout = 3000; // Connection attempt timeout
let isConnected = false; // Flag to track TCP connection status
let queueLock = false; // Lock to prevent multiple queue processing
let messageQueue = [];
let tcpClient = null; // Current TCP client instance

// Function to load configuration dynamically
const loadConfig = () => {
  try {
    const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
    return {
      wsPort: process.env.WS_PORT || config.wsPort || 8080,
      tcpHost: process.env.TCP_HOST || config.tcpHost || "localhost",
      tcpPort: process.env.TCP_PORT || config.tcpPort || 12345,
      enableTcpForwarding: process.env.ENABLE_TCP_FORWARDING
        ? process.env.ENABLE_TCP_FORWARDING === "true"
        : config.enableTcpForwarding || false,
    };
  } catch (err) {
    logger.error(`Error loading config file: ${err.message}`);
    return {
      wsPort: 8080,
      tcpHost: "localhost",
      tcpPort: 12345,
      enableTcpForwarding: false,
    };
  }
};

// Load initial configuration
let { wsPort, enableTcpForwarding } = loadConfig();

// Function to establish a TCP connection
const connectToTCPServer = async (timeout = null) => {
  handleTCPClientClose(); // Close existing client if any
  const { tcpHost, tcpPort } = loadConfig();
  logger.info(`Attempting to connect to TCP server at ${tcpHost}:${tcpPort}`);

  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    tcpClient = client; // Assign client globally
    let connectionTimeout;

    // Set timeout for connection
    if (timeout) {
      connectionTimeout = setTimeout(() => {
        handleTCPClientClose();
        reject(new Error("Connection attempt timed out."));
      }, timeout);
    }

    client.connect(tcpPort, tcpHost, () => {
      logger.info(`Connected to TCP server at ${tcpHost}:${tcpPort}`);
      if (connectionTimeout) { // Clear timeout
        clearTimeout(connectionTimeout);
        logger.info("Connection timeout cleared.");
      } 
      isConnected = true;
      resolve(client);
    });

    client.on("error", (err) => {
      logger.error(`TCP connection error: ${err.message}`);
      if (connectionTimeout) clearTimeout(connectionTimeout);
      handleTCPClientClose();
      reject(err);
    });

    client.on("close", (hadError) => {
      if (hadError) {
        logger.error("TCP connection closed due to an error.");
      } else {
        logger.warn("TCP connection closed gracefully.");
      }
      handleTCPClientClose();
    });
  });
};

// Handle TCP client close
const handleTCPClientClose = () => {
  if (tcpClient) {
    tcpClient.removeAllListeners();
    tcpClient.destroy();
    tcpClient = null;
  }
  isConnected = false;
};

// Forward data with acknowledgment
const forwardDataWithAck = async (data) => {
  return new Promise((resolve, reject) => {
    tcpClient.write(data, (writeErr) => {
      if (writeErr) {
        logger.error(`Error writing message to TCP server: ${writeErr.message}`);
        //handleTCPClientClose(); // Ensure connection is closed on error
        reject(writeErr);
        return;
      }

      tcpClient.once("data", (ack) => {
        const acknowledgment = ack.toString().trim();
        if (acknowledgment === "OK") {
          logger.info(`Server acknowledged message: ${data}`);
          //handleTCPClientClose(); // Close the connection after acknowledgment
          resolve();
        } else {
          logger.error(`Server acknowledgment failed: ${acknowledgment}`);
          handleTCPClientClose(); // Close the connection on failure
          reject(new Error(`Acknowledgment failed: ${acknowledgment}`));
        }
      });
    });
  });
};

// Process messages in the queue
const processMessageQueue = async () => {
  if (queueLock) return; // Prevent concurrent queue processing
  queueLock = true;

  while (messageQueue.length > 0) {
    const message = messageQueue.shift();

    if (!isConnected) {
      logger.info("TCP connection not established. Reconnecting...");
      try {
        await connectToTCPServer(connectionTryTimeout); // Shorter timeout for connection attempts
      } catch (err) {
        logger.error(`Reconnection failed: ${err.message}`);
        messageQueue.unshift(message); // Requeue message
        break;
      }
    }

    try {
      await forwardDataWithAck(message);
      handleTCPClientClose(); // Close the connection after successful acknowledgment
      logger.info(`Message queue size: ${messageQueue.length}`);
    } catch (err) {
      logger.error(`Error processing queued message: ${err.message}`);
      messageQueue.unshift(message); // Re-add the message
      handleTCPClientClose(); // Close the connection on error
      break;
    }
  }

  queueLock = false;
};

// Establish initial TCP connection
const establishTCPConnection = async (timeout = null) => {
  const { tcpHost, tcpPort } = loadConfig();
  if (
    !isConnected || 
    (tcpClient && tcpClient.remoteAddress !== tcpHost || tcpClient.remotePort !== tcpPort)
  ) {
    try {
      await connectToTCPServer(timeout);
    } catch (err) {
      logger.error(`Initial connection failed: ${err.message}`);
    }
  }
};

establishTCPConnection() // Initialize TCP connection
  .then(() => logger.info("Initial TCP connection established."))
  .catch((err) => logger.error(`Initial connection failed: ${err.message}`));

// Retry connecting periodically and process the message queue if not empty
setInterval(async () => {
  if (!queueLock) {
    await establishTCPConnection();
  }
  if (messageQueue.length > 0 && !queueLock) {
    logger.info("MessageQueue is not empty. Attempting to process messages...");
    await processMessageQueue();
  }
}, retryReconnectInterval);

// Create WebSocket server
const wss = new WebSocketServer({ port: wsPort }, () => {
  logger.info(`WebSocket server running on ws://localhost:${wsPort}`);
});

// Handle WebSocket connections
wss.on("connection", (ws) => {
  logger.info("WebSocket client connected.");

  ws.on("message", async (message) => {
    try {
      const payload = JSON.parse(message.toString());
      const newPayload = JSON.stringify(payload);
      logger.info(`Received WebSocket message: ${newPayload}`);

      if (enableTcpForwarding) {
        messageQueue.push(newPayload); // Add to queue
        await processMessageQueue(); // Start queue processing
      }
    } catch (err) {
      logger.error(`Error processing WebSocket message: ${err.message}`);
    }
  });

  ws.on("close", () => {
    logger.warn("WebSocket client disconnected.");
  });

  ws.on("error", (error) => {
    logger.error(`WebSocket error: ${error.message}`);
  });
});