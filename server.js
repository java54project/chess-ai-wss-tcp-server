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

// Create a WebSocket server
const wss = new WebSocketServer({ port: wsPort }, () => {
  console.log(`WebSocket server running on ws://localhost:${wsPort}`);
});

// Function to forward data via TCP
const forwardDataViaTCP = (data) => {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();

    client.connect(tcpPort, tcpHost, () => {
      console.log(`Connected to TCP server at ${tcpHost}:${tcpPort}`);
      client.write(data);
    });

    client.on("data", (response) => {
      console.log("TCP server response:", response.toString());
      client.destroy();
      resolve();
    });

    client.on("error", (err) => {
      console.error("Failed to forward data via TCP:", err.message);
      client.destroy();
      reject(err);
    });

    client.on("close", () => {
      console.log("TCP connection closed.");
    });
  });
};

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