import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import EventSource from "eventsource";

// Polyfill EventSource for Node.js
global.EventSource = EventSource;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3003;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3004/sse';

const app = express();

let mcpClient = null;
let isConnecting = false;

async function connectMcp() {
  if (mcpClient) return mcpClient;
  if (isConnecting) return null; // Prevent concurrent connection attempts

  isConnecting = true;
  console.log(`Attempting to connect to MCP server at ${MCP_SERVER_URL}...`);
  try {
    const transport = new SSEClientTransport(new URL(MCP_SERVER_URL));
    const client = new Client(
      { name: "dashboard", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(transport);
    console.log(`Connected to MCP server at ${MCP_SERVER_URL}`);
    mcpClient = client;
    isConnecting = false;

    // Handle disconnects if possible via transport events?
    // SDK doesn't expose easy disconnect event on client yet, but transport might error.
    transport.onerror = (err) => {
        console.error("MCP Transport Error:", err);
        mcpClient = null; // Reset client to force reconnect
    };
    transport.onclose = () => {
        console.log("MCP Transport Closed");
        mcpClient = null;
    };

    return client;
  } catch (error) {
    console.error("Failed to connect to MCP server:", error);
    isConnecting = false;
    return null;
  }
}

// Serve static files
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/metrics', async (req, res) => {
  const timeframe = req.query.timeframe || 'last_hour';

  let client = mcpClient;
  if (!client) {
    client = await connectMcp();
  }

  if (!client) {
    return res.status(503).json({ error: "MCP server unavailable" });
  }

  try {
    const result = await client.callTool({
      name: "get_metrics",
      arguments: { timeframe }
    });

    if (result && result.content && result.content[0] && result.content[0].text) {
      const metrics = JSON.parse(result.content[0].text);
      res.json(metrics);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error("Error fetching metrics:", error);
    // If error is connection related, reset client
    if (error.message.includes("fetch") || error.message.includes("network") || error.message.includes("closed")) {
        mcpClient = null;
    }
    res.status(500).json({ error: "Failed to fetch metrics: " + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
  connectMcp(); // Initial connection
});
