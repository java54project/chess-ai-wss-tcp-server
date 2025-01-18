const { WebSocketServer } = require("ws");
const net = require("net");
const fs = require("fs");
const logger = require("./src/utils/logger"); // Logger module
const { log } = require("console");

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
      wsPort: config.wsPort || process.env.WS_PORT || 8080,
      tcpHost: config.tcpHost || process.env.TCP_HOST || "localhost",
      tcpPort: config.tcpPort || process.env.TCP_PORT || 3000,
      enableTcpForwarding: config.enableTcpForwarding !== undefined 
        ? config.enableTcpForwarding 
        : (process.env.ENABLE_TCP_FORWARDING === "true"),
    };
  } catch (err) {
    logger.error(`Error loading config file: ${err.message}`);
    return {
      wsPort: process.env.WS_PORT || 8080,
      tcpHost: process.env.TCP_HOST || "localhost",
      tcpPort: process.env.TCP_PORT || 12345,
      enableTcpForwarding: process.env.ENABLE_TCP_FORWARDING === "true",
    };
  }
};

// Load initial configuration
let { wsPort, enableTcpForwarding } = loadConfig();

// Function to establish a TCP connection
const connectToTCPServer = async (timeout = null) => {
  if (tcpClient) {    
    handleTCPClientClose();
  }
  const { tcpHost, tcpPort } = loadConfig();
  logger.info("Establishing TCP connection...");
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
  logger.info("TCP client connection closed and resources released.");
};

// Forward data with acknowledgment
const forwardDataWithAck = async (data) => {
  // TODO: Adjust the code to handle acknowledgment from the server if not 'OK' received for the case
  // where the server is connected but message was not processed correctly. In this case no closure ('close' event) is initiated.
  // As solution: add handleTCPClientClose() in the end of the tcpClient.write() after all 'if'.
  if (!tcpClient || !tcpClient.writable) {
    throw new Error("TCP client is not connected or writable.");
}
  return new Promise((resolve, reject) => {
    tcpClient.write(data, (writeErr) => {
      if (writeErr) {
        logger.error(`Error writing message to TCP server: ${writeErr.message}`);
        reject(writeErr);
        return;
      }

      tcpClient.once("data", (ack) => {
        const acknowledgment = ack.toString().trim();
        if (acknowledgment === "OK") {
          logger.info(`Server acknowledged message: ${data}`);
          resolve();
        } else {
          logger.error(`Server acknowledgment failed: ${acknowledgment}`);
          reject(new Error(`Acknowledgment failed: ${acknowledgment}`));
        }
      });
    });
  });
};

// Process messages in the queue
const processMessageQueue = async () => {
  if (queueLock) return;
  queueLock = true;

  while (messageQueue.length > 0) {
    const message = messageQueue.shift();
    try {
      if (!isConnected) {
        await connectToTCPServer(connectionTryTimeout);
      }
      await forwardDataWithAck(message);
      handleTCPClientClose();
      logger.info(`Message processed. Queue size: ${messageQueue.length}`);
    } catch (err) {
      handleTCPClientClose();
      logger.error(`Error processing message: ${err.message}`);
      messageQueue.unshift(message);
      logger.info(`Unshifting message. Queue size: ${messageQueue.length}`);
      break; // Stop processing on error
    }
  }
  queueLock = false;
};

// Initialize TCP connection
connectToTCPServer();

// Retry connecting periodically and process the message queue if not empty
setInterval(async () => {
  const { tcpHost, tcpPort } = loadConfig();
  if (!isConnected || 
    (tcpClient && tcpClient.remoteAddress !== tcpHost || tcpClient.remotePort !== tcpPort)) {
      await connectToTCPServer();
  }
  if (!queueLock && messageQueue.length > 0) {
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
        logger.info(`Message queue size: ${messageQueue.length}`);
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