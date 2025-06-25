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
  if (!id && method && method.startsWith("notifications/")) {
    console.error(`Received notification: ${method}`);
    return null; // No response needed for notifications
  }

  // Handle requests that don't need implementation
  if (id === undefined || id === null) {
    return null; // No response for notifications
  }

  try {
    let result;

    switch (method) {
      case "initialize":
        // RESPOND IMMEDIATELY - don't wait for extension
        console.error(`MCP client initializing: ${params?.clientInfo?.name || "unknown"}`);
        result = {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "browser-mcp-server",
            version: "1.0.0",
          },
          instructions: "Browser automation tools via Chrome Extension bridge. Extension may take a moment to connect."
        };
        break;

      case "tools/list":
        // Debug logging
        console.error(`Tools/list called. Extension connected: ${chromeExtensionSocket && chromeExtensionSocket.readyState === WebSocket.OPEN}, Available tools: ${availableTools.length}`);
        
        // Return tools from extension if available, otherwise fallback tools
        if (chromeExtensionSocket && chromeExtensionSocket.readyState === WebSocket.OPEN && availableTools.length > 0) {
          console.error(`Returning ${availableTools.length} tools from extension`);
          result = {
            tools: availableTools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            })),
          };
        } else {
          // Return basic fallback tools
          console.error("Extension not connected, returning fallback tools");
          result = {
            tools: getFallbackTools()
          };
        }
        break;

      case "tools/call":
        if (!chromeExtensionSocket || chromeExtensionSocket.readyState !== WebSocket.OPEN) {
          // Extension not connected - return helpful error
          result = {
            content: [
              {
                type: "text",
                text: "❌ Chrome Extension not connected. Please install and activate the browser extension, then try again.\n\nSetup instructions:\n1. Go to chrome://extensions/\n2. Enable Developer mode\n3. Click 'Load unpacked' and select the extension folder\n4. Ensure the extension is active",
              },
            ],
            isError: true
          };
        } else {
          // Extension connected - try the tool call
          try {
            const toolResult = await callBrowserTool(
              params.name,
              params.arguments || {}
            );
            
            // Format response based on tool type
            const formattedResult = formatToolResult(params.name, toolResult);
            
            result = {
              content: [
                {
                  type: "text",
                  text: formattedResult,
                },
              ],
              isError: false
            };
          } catch (error) {
            result = {
              content: [
                {
                  type: "text",
                  text: `❌ Tool execution failed: ${error.message}`,
                },
              ],
              isError: true
            };
          }
        }
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

// Remove static tools - they were causing duplicates
// All tools now come from the extension only

// Format tool results for better MCP response
function formatToolResult(toolName, result) {
  const metadata = {
    tool: toolName,
    execution_time: result.execution_time || 0,
    timestamp: new Date().toISOString()
  };
  
  switch (toolName) {
    case 'page_analyze':
      if (result.elements && result.elements.length > 0) {
        const summary = `Found ${result.elements.length} relevant elements using ${result.method}:\n\n` +
          result.elements.map(el => 
            `• ${el.name} (${el.type}) - Confidence: ${Math.round(el.confidence * 100)}%\n  Selector: ${el.selector}\n  Element ID: ${el.id}`
          ).join('\n\n');
        return `${summary}\n\n${JSON.stringify(metadata, null, 2)}`;
      } else {
        return `No relevant elements found for intent: "${result.intent_hint || 'unknown'}"\n\n${JSON.stringify(metadata, null, 2)}`;
      }
      
    case 'page_extract_content':
      const contentSummary = `Extracted ${result.content_type} content using ${result.method}:\n\n`;
      if (result.content) {
        const preview = typeof result.content === 'string' 
          ? result.content.substring(0, 500) + (result.content.length > 500 ? '...' : '')
          : JSON.stringify(result.content, null, 2).substring(0, 500);
        return `${contentSummary}${preview}\n\n${JSON.stringify(metadata, null, 2)}`;
      } else {
        return `${contentSummary}No content found\n\n${JSON.stringify(metadata, null, 2)}`;
      }
      
    case 'element_click':
      return `✅ Successfully clicked element: ${result.element_name || result.element_id}\n` +
             `Click type: ${result.click_type || 'left'}\n\n${JSON.stringify(metadata, null, 2)}`;
             
    case 'element_fill':
      return `✅ Successfully filled element: ${result.element_name || result.element_id}\n` +
             `Value: "${result.value}"\n\n${JSON.stringify(metadata, null, 2)}`;
             
    case 'page_navigate':
      return `✅ Successfully navigated to: ${result.url || 'unknown URL'}\n\n${JSON.stringify(metadata, null, 2)}`;
      
    case 'page_wait_for':
      return `✅ Condition met: ${result.condition_type || 'unknown'}\n` +
             `Wait time: ${result.wait_time || 0}ms\n\n${JSON.stringify(metadata, null, 2)}`;
             
    default:
      // Legacy tools or unknown tools
      return JSON.stringify(result, null, 2);
  }
}

// Fallback tools when extension is not connected
function getFallbackTools() {
  return [
    {
      name: "page_analyze",
      description: "Analyze current page structure (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          intent_hint: { type: "string", description: "What user wants to do" }
        },
        required: ["intent_hint"]
      }
    },
    {
      name: "page_extract_content",
      description: "Extract structured content (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          content_type: { type: "string", enum: ["article", "search_results", "posts"] }
        },
        required: ["content_type"]
      }
    },
    {
      name: "element_click",
      description: "Click page elements (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          element_id: { type: "string", description: "Element ID from page_analyze" }
        },
        required: ["element_id"]
      }
    },
    {
      name: "element_fill",
      description: "Fill input fields (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          element_id: { type: "string", description: "Element ID" },
          value: { type: "string", description: "Text to input" }
        },
        required: ["element_id", "value"]
      }
    },
    {
      name: "page_navigate",
      description: "Navigate to URLs (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to navigate to" }
        },
        required: ["url"]
      }
    },
    {
      name: "page_wait_for",
      description: "Wait for elements (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          condition_type: { type: "string", enum: ["element_visible", "text_present"] }
        },
        required: ["condition_type"]
      }
    },
    {
      name: "browser_navigate",
      description: "Navigate to URLs - legacy (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to navigate to" }
        },
        required: ["url"]
      }
    },
    {
      name: "browser_execute_script",
      description: "Execute JavaScript (Extension required - limited by CSP)",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "JavaScript code" }
        },
        required: ["code"]
      }
    }
  ];
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
        console.error(`✅ Registered ${availableTools.length} browser tools from extension`);
        console.error(`Tools: ${availableTools.map(t => t.name).join(', ')}`);
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
    availableTools = []; // Clear tools when extension disconnects
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
