const { WebSocketServer } = require("ws");
const net = require("net");
const fs = require("fs");

// Load configuration from config.json
const defaultConfig = JSON.parse(fs.readFileSync("config.json", "utf8"));

// Retrieve configuration values from environment variables or use fallback
const wsPort = process.env.WS_PORT || defaultConfig.wsPort || 8080;
const tcpHost = process.env.TCP_HOST || defaultConfig.tcpHost || "localhost";
const tcpPort = process.env.TCP_PORT || defaultConfig.tcpPort || 12345;
const enableTcpForwarding = process.env.ENABLE_TCP_FORWARDING
  ? process.env.ENABLE_TCP_FORWARDING === "true"
  : defaultConfig.enableTcpForwarding || false;

// Message queue to hold unsent messages
let messageQueue = [];
let tcpClient = null; // Active TCP client instance

// Retry connection interval in milliseconds
const retryInterval = 5000;

// Function to establish a TCP connection
const connectToTCPServer = async () => {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    client.connect(tcpPort, tcpHost, () => {
      console.log(`Connected to TCP server at ${tcpHost}:${tcpPort}`);
      tcpClient = client;

      // Process queued messages
      while (messageQueue.length > 0) {
        const message = messageQueue.shift();
        client.write(message);
        console.log("Forwarded message from queue:", message);
      }

      resolve(client);
    });

    client.on("error", (err) => {
      console.error("TCP connection error:", err.message);
      tcpClient = null; // Reset client on error
      reject(err);
    });

    client.on("close", () => {
      console.log("TCP connection closed.");
      tcpClient = null; // Reset client on close
    });
  });
};

// Function to forward data via TCP
const forwardDataViaTCP = async (data) => {
  if (!tcpClient) {
    try {
      tcpClient = await connectToTCPServer();
    } catch (err) {
      console.error("TCP forwarding failed. Adding message to queue:", data);
      messageQueue.push(data); // Add to queue on failure
      return;
    }
  }

  try {
    tcpClient.write(data);
    console.log("Forwarded message:", data);
  } catch (err) {
    console.error("Error sending message via TCP:", err.message);
    messageQueue.push(data); // Add to queue on failure
  }
};

// Periodically retry connecting to the TCP server
setInterval(async () => {
  if (!tcpClient && messageQueue.length > 0) {
    console.log("Retrying connection to TCP server...");
    try {
      await connectToTCPServer();
    } catch (err) {
      console.error("Retry connection failed:", err.message);
    }
  }
}, retryInterval);

// Create a WebSocket server
const wss = new WebSocketServer({ port: wsPort }, () => {
  console.log(`WebSocket server running on ws://localhost:${wsPort}`);
});

// Handle WebSocket connections
wss.on("connection", (ws) => {
  console.log("WebSocket client connected.");

  ws.on("message", async (message) => {
    try {
      const payload = JSON.parse(message.toString());
      console.log("Received payload from client:", payload);

      if (enableTcpForwarding) {
        await forwardDataViaTCP(message);
      }
    } catch (err) {
      console.error("Error processing message:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("WebSocket client disconnected.");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
});