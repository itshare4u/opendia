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
        console.error(
          `MCP client initializing: ${params?.clientInfo?.name || "unknown"}`
        );
        result = {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "browser-mcp-server",
            version: "2.0.0",
          },
          instructions:
            "🎯 Enhanced browser automation with anti-detection bypass for Twitter/X, LinkedIn, Facebook. Extension may take a moment to connect.",
        };
        break;

      case "tools/list":
        // Debug logging
        console.error(
          `Tools/list called. Extension connected: ${
            chromeExtensionSocket &&
            chromeExtensionSocket.readyState === WebSocket.OPEN
          }, Available tools: ${availableTools.length}`
        );

        // Return tools from extension if available, otherwise fallback tools
        if (
          chromeExtensionSocket &&
          chromeExtensionSocket.readyState === WebSocket.OPEN &&
          availableTools.length > 0
        ) {
          console.error(
            `Returning ${availableTools.length} tools from extension`
          );
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
            tools: getFallbackTools(),
          };
        }
        break;

      case "tools/call":
        if (
          !chromeExtensionSocket ||
          chromeExtensionSocket.readyState !== WebSocket.OPEN
        ) {
          // Extension not connected - return helpful error
          result = {
            content: [
              {
                type: "text",
                text: "❌ Chrome Extension not connected. Please install and activate the browser extension, then try again.\n\nSetup instructions:\n1. Go to chrome://extensions/\n2. Enable Developer mode\n3. Click 'Load unpacked' and select the extension folder\n4. Ensure the extension is active\n\n🎯 Features: Anti-detection bypass for Twitter/X, LinkedIn, Facebook + universal automation",
              },
            ],
            isError: true,
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
              isError: false,
            };
          } catch (error) {
            result = {
              content: [
                {
                  type: "text",
                  text: `❌ Tool execution failed: ${error.message}`,
                },
              ],
              isError: true,
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

// Enhanced tool result formatting with anti-detection support
function formatToolResult(toolName, result) {
  const metadata = {
    tool: toolName,
    execution_time: result.execution_time || 0,
    timestamp: new Date().toISOString(),
  };

  switch (toolName) {
    case "page_analyze":
      return formatPageAnalyzeResult(result, metadata);

    case "page_extract_content":
      return formatContentExtractionResult(result, metadata);

    case "element_click":
      return formatElementClickResult(result, metadata);

    case "element_fill":
      return formatElementFillResult(result, metadata);

    case "page_navigate":
      return `✅ Successfully navigated to: ${
        result.url || "unknown URL"
      }\n\n${JSON.stringify(metadata, null, 2)}`;

    case "page_wait_for":
      return (
        `✅ Condition met: ${result.condition_type || "unknown"}\n` +
        `Wait time: ${result.wait_time || 0}ms\n\n${JSON.stringify(
          metadata,
          null,
          2
        )}`
      );

    default:
      // Legacy tools or unknown tools
      return JSON.stringify(result, null, 2);
  }
}

function formatPageAnalyzeResult(result, metadata) {
  if (result.elements && result.elements.length > 0) {
    const platformInfo = result.summary?.anti_detection_platform
      ? `\n🎯 Anti-detection platform detected: ${result.summary.anti_detection_platform}`
      : "";

    const summary =
      `Found ${result.elements.length} relevant elements using ${result.method}:${platformInfo}\n\n` +
      result.elements
        .map((el) => {
          const readyStatus = el.ready ? "✅ Ready" : "⚠️ Not ready";
          const stateInfo = el.state === "disabled" ? " (disabled)" : "";
          return `• ${el.name} (${el.type}) - Confidence: ${el.conf}% ${readyStatus}${stateInfo}\n  Element ID: ${el.id}`;
        })
        .join("\n\n");
    return `${summary}\n\n${JSON.stringify(metadata, null, 2)}`;
  } else {
    const intentHint = result.intent_hint || "unknown";
    const platformInfo = result.summary?.anti_detection_platform
      ? `\nPlatform: ${result.summary.anti_detection_platform}`
      : "";
    return `No relevant elements found for intent: "${intentHint}"${platformInfo}\n\n${JSON.stringify(
      metadata,
      null,
      2
    )}`;
  }
}

function formatContentExtractionResult(result, metadata) {
  const contentSummary = `Extracted ${result.content_type} content using ${result.method}:\n\n`;
  if (result.content) {
    const preview =
      typeof result.content === "string"
        ? result.content.substring(0, 500) +
          (result.content.length > 500 ? "..." : "")
        : JSON.stringify(result.content, null, 2).substring(0, 500);
    return `${contentSummary}${preview}\n\n${JSON.stringify(
      metadata,
      null,
      2
    )}`;
  } else if (result.summary) {
    // Enhanced summarized content response
    const summaryText = formatContentSummary(
      result.summary,
      result.content_type
    );
    return `${contentSummary}${summaryText}\n\n${JSON.stringify(
      metadata,
      null,
      2
    )}`;
  } else {
    return `${contentSummary}No content found\n\n${JSON.stringify(
      metadata,
      null,
      2
    )}`;
  }
}

function formatContentSummary(summary, contentType) {
  switch (contentType) {
    case "article":
      return (
        `📰 Article: "${summary.title}"\n` +
        `📝 Word count: ${summary.word_count}\n` +
        `⏱️ Reading time: ${summary.reading_time} minutes\n` +
        `🖼️ Has media: ${summary.has_images || summary.has_videos}\n` +
        `Preview: ${summary.preview}`
      );

    case "search_results":
      return (
        `🔍 Search Results Summary:\n` +
        `📊 Total results: ${summary.total_results}\n` +
        `🏆 Quality score: ${summary.quality_score}/100\n` +
        `📈 Average relevance: ${Math.round(summary.avg_score * 100)}%\n` +
        `🌐 Top domains: ${summary.top_domains
          ?.map((d) => d.domain)
          .join(", ")}\n` +
        `📝 Result types: ${summary.result_types?.join(", ")}`
      );

    case "posts":
      return (
        `📱 Social Posts Summary:\n` +
        `📊 Post count: ${summary.post_count}\n` +
        `📝 Average length: ${summary.avg_length} characters\n` +
        `❤️ Total engagement: ${summary.engagement_total}\n` +
        `🖼️ Posts with media: ${summary.has_media_count}\n` +
        `👥 Unique authors: ${summary.authors}\n` +
        `📋 Post types: ${summary.post_types?.join(", ")}`
      );

    default:
      return JSON.stringify(summary, null, 2);
  }
}

function formatElementClickResult(result, metadata) {
  return (
    `✅ Successfully clicked element: ${
      result.element_name || result.element_id
    }\n` +
    `Click type: ${result.click_type || "left"}\n\n${JSON.stringify(
      metadata,
      null,
      2
    )}`
  );
}

function formatElementFillResult(result, metadata) {
  // Enhanced formatting for anti-detection bypass methods
  const methodEmojis = {
    twitter_direct_bypass: "🐦 Twitter Direct Bypass",
    linkedin_direct_bypass: "💼 LinkedIn Direct Bypass",
    facebook_direct_bypass: "📘 Facebook Direct Bypass",
    generic_direct_bypass: "🎯 Generic Direct Bypass",
    standard_fill: "🔧 Standard Fill",
    anti_detection_bypass: "🛡️ Anti-Detection Bypass",
  };

  const methodDisplay = methodEmojis[result.method] || result.method;
  const successIcon = result.success ? "✅" : "❌";

  let fillResult = `${successIcon} Element fill ${
    result.success ? "completed" : "failed"
  } using ${methodDisplay}\n`;
  fillResult += `📝 Target: ${result.element_name || result.element_id}\n`;
  fillResult += `💬 Input: "${result.value}"\n`;

  if (result.actual_value) {
    fillResult += `📄 Result: "${result.actual_value}"\n`;
  }

  // Add bypass-specific information
  if (
    result.method?.includes("bypass") &&
    result.execCommand_result !== undefined
  ) {
    fillResult += `🔧 execCommand success: ${result.execCommand_result}\n`;
  }

  if (!result.success && result.method?.includes("bypass")) {
    fillResult += `\n⚠️ Direct bypass failed - page may have enhanced detection. Try refreshing the page.\n`;
  }

  return `${fillResult}\n${JSON.stringify(metadata, null, 2)}`;
}

// Enhanced fallback tools when extension is not connected
function getFallbackTools() {
  return [
    {
      name: "page_analyze",
      description:
        "🎯 Analyze page structure with anti-detection bypass (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          intent_hint: {
            type: "string",
            description:
              "What user wants to do: post_tweet, search, login, etc.",
          },
          phase: {
            type: "string",
            enum: ["discover", "detailed"],
            default: "discover",
            description:
              "Analysis phase: 'discover' for quick scan, 'detailed' for full analysis",
          },
        },
        required: ["intent_hint"],
      },
    },
    {
      name: "page_extract_content",
      description:
        "📄 Extract structured content with smart summarization (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          content_type: {
            type: "string",
            enum: ["article", "search_results", "posts"],
            description: "Type of content to extract",
          },
          summarize: {
            type: "boolean",
            default: true,
            description:
              "Return summary instead of full content (saves tokens)",
          },
        },
        required: ["content_type"],
      },
    },
    {
      name: "element_click",
      description:
        "🖱️ Click page elements with smart targeting (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description: "Element ID from page_analyze",
          },
          click_type: {
            type: "string",
            enum: ["left", "right", "double"],
            default: "left",
          },
        },
        required: ["element_id"],
      },
    },
    {
      name: "element_fill",
      description:
        "✍️ Fill input fields with anti-detection bypass for Twitter/X, LinkedIn, Facebook (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description: "Element ID from page_analyze",
          },
          value: {
            type: "string",
            description: "Text to input",
          },
          clear_first: {
            type: "boolean",
            default: true,
            description: "Clear existing content before filling",
          },
        },
        required: ["element_id", "value"],
      },
    },
    {
      name: "page_navigate",
      description:
        "🧭 Navigate to URLs with wait conditions (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to navigate to" },
          wait_for: {
            type: "string",
            description: "CSS selector to wait for after navigation",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "page_wait_for",
      description: "⏳ Wait for elements or conditions (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          condition_type: {
            type: "string",
            enum: ["element_visible", "text_present"],
            description: "Type of condition to wait for",
          },
          selector: {
            type: "string",
            description: "CSS selector (for element_visible condition)",
          },
          text: {
            type: "string",
            description: "Text to wait for (for text_present condition)",
          },
        },
        required: ["condition_type"],
      },
    },
    {
      name: "get_analytics",
      description: "📊 Get performance analytics and token usage metrics",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "clear_analytics",
      description: "🗑️ Clear analytics data and reset performance tracking",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "browser_navigate",
      description: "🌐 Navigate to URLs - legacy (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to navigate to" },
        },
        required: ["url"],
      },
    },
    {
      name: "browser_execute_script",
      description:
        "⚡ Execute JavaScript (Extension required - limited by CSP)",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "JavaScript code" },
        },
        required: ["code"],
      },
    },
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
        console.error(
          `✅ Registered ${availableTools.length} browser tools from extension`
        );
        console.error(
          `🎯 Enhanced tools with anti-detection bypass: ${availableTools
            .map((t) => t.name)
            .join(", ")}`
        );
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
    features: [
      "Anti-detection bypass for Twitter/X, LinkedIn, Facebook",
      "Two-phase intelligent page analysis",
      "Smart content extraction with summarization",
      "Element state detection and interaction readiness",
      "Performance analytics and token optimization",
    ],
  });
});

app.listen(3001, () => {
  console.error("🎯 Enhanced Browser MCP Server with Anti-Detection Features");
  console.error(
    "Health check endpoint available at http://localhost:3001/health"
  );
});

console.error("🚀 Enhanced Browser MCP Server started");
console.error(
  "🔌 Waiting for Chrome Extension connection on ws://localhost:3000"
);
console.error("🎯 Features: Anti-detection bypass + intelligent automation");
