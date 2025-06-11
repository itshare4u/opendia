#!/usr/bin/env node

const WebSocket = require("ws");
const express = require("express");

// WebSocket server for Chrome Extension
const wss = new WebSocket.Server({ port: 3000 });
let chromeExtensionSocket = null;
let availableTools = [];

// Tool call tracking
const pendingCalls = new Map();

// Simple MCP protocol implementation over stdio
async function handleMCPRequest(request) {
  const { method, params, id } = request;

  // Handle notifications (no id means it's a notification)
  if (!id && method.startsWith("notifications/")) {
    console.error(`Received notification: ${method}`);
    return null; // No response needed for notifications
  }

  // Handle requests that don't need implementation
  if (!id) {
    return null; // No response for notifications
  }

  try {
    let result;

    switch (method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "browser-mcp-server",
            version: "1.0.0",
          },
        };
        break;

      case "tools/list":
        result = {
          tools: availableTools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        };
        break;

      case "tools/call":
        const toolResult = await callBrowserTool(
          params.name,
          params.arguments || {}
        );
        result = {
          content: [
            {
              type: "text",
              text: JSON.stringify(toolResult, null, 2),
            },
          ],
        };
        break;

      case "resources/list":
        // Return empty resources list
        result = { resources: [] };
        break;

      case "prompts/list":
        // Return empty prompts list
        result = { prompts: [] };
        break;

      default:
        throw new Error(`Unknown method: ${method}`);
    }

    return { jsonrpc: "2.0", id, result };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error.message,
      },
    };
  }
}

// Call browser tool through Chrome Extension
async function callBrowserTool(toolName, args) {
  if (
    !chromeExtensionSocket ||
    chromeExtensionSocket.readyState !== WebSocket.OPEN
  ) {
    throw new Error(
      "Chrome Extension not connected. Make sure the extension is installed and active."
    );
  }

  const callId = Date.now().toString();

  return new Promise((resolve, reject) => {
    pendingCalls.set(callId, { resolve, reject });

    chromeExtensionSocket.send(
      JSON.stringify({
        id: callId,
        method: toolName,
        params: args,
      })
    );

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingCalls.has(callId)) {
        pendingCalls.delete(callId);
        reject(new Error("Tool call timeout"));
      }
    }, 30000);
  });
}

// Handle tool responses from Chrome Extension
function handleToolResponse(message) {
  const pending = pendingCalls.get(message.id);
  if (pending) {
    pendingCalls.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message));
    } else {
      pending.resolve(message.result);
    }
  }
}

// Handle Chrome Extension connections
wss.on("connection", (ws) => {
  console.error("Chrome Extension connected");
  chromeExtensionSocket = ws;

  // Set up ping/pong for keepalive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data);

      if (message.type === "register") {
        availableTools = message.tools;
        console.error(`Registered ${availableTools.length} browser tools`);
      } else if (message.type === "ping") {
        // Respond to ping with pong
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      } else if (message.id) {
        // Handle tool response
        handleToolResponse(message);
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });

  ws.on("close", () => {
    console.error("Chrome Extension disconnected");
    chromeExtensionSocket = null;
    clearInterval(pingInterval);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  ws.on("pong", () => {
    // Extension is alive
  });
});

// Read from stdin
let inputBuffer = "";
process.stdin.on("data", async (chunk) => {
  inputBuffer += chunk.toString();

  // Process complete lines
  const lines = inputBuffer.split("\n");
  inputBuffer = lines.pop() || "";

  for (const line of lines) {
    if (line.trim()) {
      try {
        const request = JSON.parse(line);
        const response = await handleMCPRequest(request);

        // Only send response if one was generated (not for notifications)
        if (response) {
          process.stdout.write(JSON.stringify(response) + "\n");
        }
      } catch (error) {
        console.error("Error processing request:", error);
      }
    }
  }
});

// Optional: HTTP endpoint for health checks
const app = express();
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    chromeExtensionConnected: chromeExtensionSocket !== null,
    availableTools: availableTools.length,
  });
});

app.listen(3001, () => {
  console.error(
    "Health check endpoint available at http://localhost:3001/health"
  );
});

console.error("Browser MCP Server started");
console.error("Waiting for Chrome Extension connection on ws://localhost:3000");
