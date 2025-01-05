Here’s the updated and properly styled README.md file:

# Chess AI WebSocket to TCP Server

This server acts as a bridge between a WebSocket client (e.g., the Chess AI application) and a remote TCP server. It receives data from the WebSocket client, queues the data if necessary, and forwards it to the remote TCP server when a connection is established.

---

## Features

- **WebSocket Support**: Receives real-time data from the Chess AI client.
- **TCP Forwarding**: Forwards received data to a remote TCP server.
- **Message Queue**: Ensures no data is lost during temporary TCP disconnections.
- **Configurable**: Easily configurable via `.env` file or `config.json`.

---

## Prerequisites

1. **Node.js**: Install [Node.js](https://nodejs.org/) (v14 or later recommended).
2. **Git**: Install [Git](https://git-scm.com/).
3. **Docker**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop).
4. **Docker Compose**: Comes pre-installed with Docker Desktop.

---

## Setup Instructions (Without Docker)

1. Clone the Repository 
   Bash:
   git clone https://github.com/java54project/chess-ai-wss-tcp-server.git
   cd chess-ai-wss-tcp-server

2.  Install Dependencies

npm install

3.  Configure the Server
Edit the .env file to match your setup:

WS_PORT=8080
TCP_HOST=remote-tcp-server.com
TCP_PORT=9090
ENABLE_TCP_FORWARDING=true

4.  Run the Server

node server.js

5.  Run in Development Mode

Use nodemon for automatic restarts during development:

npm install --save-dev nodemon
npx nodemon server.js

## Setup Instructions (With Docker)

1.  Clone the Repository

git clone https://github.com/java54project/chess-ai-wss-tcp-server.git
cd chess-ai-wss-tcp-server

2.  Configure the Server

Edit the .env file to match your setup:

WS_PORT=8080
TCP_HOST=remote-tcp-server.com
TCP_PORT=9090
ENABLE_TCP_FORWARDING=true

3.  Build the Docker Image

docker-compose build

4.  Run the Server in Docker

docker-compose up -d

5.  Monitor Logs

docker-compose logs -f

6.  Stop the Server

### docker-compose down

How It Works
1.  WebSocket Client Connection

	•   The server listens for WebSocket connections on the port specified in .env.
	•   Logs indicate when a client connects or disconnects.
2.  Message Queue

	•   If the TCP connection is unavailable, incoming messages are added to a queue.
	•   The server processes queued messages when the TCP connection is restored.
3.  TCP Forwarding

	•   Messages received from the WebSocket client are forwarded to the remote TCP server.
	•   Logs show the TCP server’s responses.
4.  Error Handling

	•   Logs display errors for WebSocket or TCP issues.
	•   The server retries TCP connections automatically when needed.

## Testing the Server

1.  Start the Server

For non-Docker setup:

node server.js

For Docker setup:

docker-compose up -d

2.  Connect a WebSocket Client

Use the Chess AI client or any WebSocket testing tool (e.g., wscat):

npx wscat -c ws://localhost:8080

3.  Send Test Data

Example payload:

{
  "deviceId": "test-device",
  "boardNumber": 1,
  "moves": "e2e4",
  "lastMove": "e2e4"
}

4.  Simulate TCP Disconnection

	•   Temporarily stop the TCP server and observe how the message queue handles unsent data.
	•   Restart the TCP server and observe the logs as queued messages are sent.

## Folder Structure

chess-ai-wss-tcp-server/
├── server.js          # Main server code
├── .env               # Environmental variables
├── docker-compose.yml # Docker Compose file
├── Dockerfile         # Dockerfile to build the image
├── config.json        # Configuration file with fallback defaults
├── package.json       # Node.js dependencies and scripts
├── package-lock.json  # Dependency lock file
└── README.md          # Project documentation

## Troubleshooting
	•   Error: Address in Use
Ensure the WS_PORT is not already in use by another process. Change the port in .env if necessary.
	•   WebSocket Not Connecting
Verify the WebSocket client is using the correct host and port.
	•   TCP Connection Fails
Ensure the remote TCP server is reachable and listening on the specified port.

## Sharing the Docker Setup

To share the Docker setup with your team:
1.  Share the Repository: Provide access to the repository containing the docker-compose.yml and .env files.
2.  Clone and Edit: Team members can clone the repository and edit the .env file as needed.
3.  Start the Server:

docker-compose up -d

4.  Stop the Server:

docker-compose down