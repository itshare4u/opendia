#!/usr/bin/env node

const WebSocket = require("ws");
const express = require("express");

// ADD: New imports for SSE transport
const cors = require('cors');
const { createServer } = require('http');
const { spawn } = require('child_process');

// ADD: Command line argument parsing
const args = process.argv.slice(2);
const enableTunnel = args.includes('--tunnel') || args.includes('--auto-tunnel');
const sseOnly = args.includes('--sse-only');

// ADD: Express app setup
const app = express();
app.use(cors());
app.use(express.json());

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

    case "get_history":
      return formatHistoryResult(result, metadata);

    case "get_selected_text":
      return formatSelectedTextResult(result, metadata);

    case "page_scroll":
      return formatScrollResult(result, metadata);

    case "get_page_links":
      return formatLinksResult(result, metadata);

    case "tab_create":
      return formatTabCreateResult(result, metadata);

    case "tab_close":
      return formatTabCloseResult(result, metadata);

    case "tab_list":
      return formatTabListResult(result, metadata);

    case "tab_switch":
      return formatTabSwitchResult(result, metadata);

    case "element_get_state":
      return formatElementStateResult(result, metadata);

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
    // Check if this is full content extraction (summarize=false) or summary
    // If it's a content object with properties, show full content
    // If it's a string or small content, it's probably summarized
    let preview;
    if (typeof result.content === "string") {
      // String content - likely summarized, keep truncation
      preview = result.content.substring(0, 500) + (result.content.length > 500 ? "..." : "");
    } else if (result.content && typeof result.content === "object") {
      // Object content - check if it's full content extraction
      if (result.content.content && result.content.content.length > 1000) {
        // This looks like full content extraction - don't truncate
        preview = JSON.stringify(result.content, null, 2);
      } else {
        // Smaller content, apply truncation
        preview = JSON.stringify(result.content, null, 2).substring(0, 500);
      }
    } else {
      // Fallback
      preview = JSON.stringify(result.content, null, 2).substring(0, 500);
    }
    
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

function formatHistoryResult(result, metadata) {
  if (!result.history_items || result.history_items.length === 0) {
    return `🕒 No history items found matching the criteria\n\n${JSON.stringify(metadata, null, 2)}`;
  }

  const summary = `🕒 Found ${result.history_items.length} history items (${result.metadata.total_found} total matches):\n\n`;
  
  const items = result.history_items.map((item, index) => {
    const visitInfo = `Visits: ${item.visit_count}`;
    const timeInfo = new Date(item.last_visit_time).toLocaleDateString();
    const domainInfo = `[${item.domain}]`;
    
    return `${index + 1}. **${item.title}**\n   ${domainInfo} ${visitInfo} | Last: ${timeInfo}\n   URL: ${item.url}`;
  }).join('\n\n');

  const searchSummary = result.metadata.search_params.keywords ?
    `\n🔍 Search: "${result.metadata.search_params.keywords}"` : '';
  const dateSummary = result.metadata.search_params.date_range ?
    `\n📅 Date range: ${result.metadata.search_params.date_range}` : '';
  const domainSummary = result.metadata.search_params.domains ?
    `\n🌐 Domains: ${result.metadata.search_params.domains.join(', ')}` : '';
  const visitSummary = result.metadata.search_params.min_visit_count > 1 ?
    `\n📊 Min visits: ${result.metadata.search_params.min_visit_count}` : '';

  return `${summary}${items}${searchSummary}${dateSummary}${domainSummary}${visitSummary}\n\n${JSON.stringify(metadata, null, 2)}`;
}

function formatSelectedTextResult(result, metadata) {
  if (!result.has_selection) {
    return `📝 No text selected\n\n${result.message || "No text is currently selected on the page"}\n\n${JSON.stringify(metadata, null, 2)}`;
  }

  const textPreview = result.selected_text.length > 200
    ? result.selected_text.substring(0, 200) + "..."
    : result.selected_text;

  let summary = `📝 Selected Text (${result.character_count} characters):\n\n"${textPreview}"`;
  
  if (result.truncated) {
    summary += `\n\n⚠️ Text was truncated to fit length limit`;
  }

  if (result.selection_metadata) {
    const meta = result.selection_metadata;
    summary += `\n\n📊 Selection Details:`;
    summary += `\n• Word count: ${meta.word_count}`;
    summary += `\n• Line count: ${meta.line_count}`;
    summary += `\n• Position: ${Math.round(meta.position.x)}, ${Math.round(meta.position.y)}`;
    
    if (meta.parent_element.tag_name) {
      summary += `\n• Parent element: <${meta.parent_element.tag_name}>`;
      if (meta.parent_element.class_name) {
        summary += ` class="${meta.parent_element.class_name}"`;
      }
    }
    
    if (meta.page_info) {
      summary += `\n• Page: ${meta.page_info.title}`;
      summary += `\n• Domain: ${meta.page_info.domain}`;
    }
  }

  return `${summary}\n\n${JSON.stringify(metadata, null, 2)}`;
}

function formatScrollResult(result, metadata) {
  if (!result.success) {
    return `📜 Scroll failed: ${result.error || "Unknown error"}\n\n${JSON.stringify(metadata, null, 2)}`;
  }

  let summary = `📜 Page scrolled successfully`;
  
  if (result.direction) {
    summary += ` ${result.direction}`;
  }
  
  if (result.amount && result.amount !== "custom") {
    summary += ` (${result.amount})`;
  } else if (result.pixels) {
    summary += ` (${result.pixels}px)`;
  }

  if (result.element_scrolled) {
    summary += `\n🎯 Scrolled to element: ${result.element_scrolled}`;
  }

  if (result.scroll_position) {
    summary += `\n📍 New position: x=${result.scroll_position.x}, y=${result.scroll_position.y}`;
  }

  if (result.page_dimensions) {
    const { width, height, scrollWidth, scrollHeight } = result.page_dimensions;
    summary += `\n📐 Page size: ${width}x${height} (scrollable: ${scrollWidth}x${scrollHeight})`;
  }

  if (result.wait_time) {
    summary += `\n⏱️ Waited ${result.wait_time}ms after scroll`;
  }

  return `${summary}\n\n${JSON.stringify(metadata, null, 2)}`;
}

function formatLinksResult(result, metadata) {
  if (!result.links || result.links.length === 0) {
    return `🔗 No links found on the page\n\n${JSON.stringify(metadata, null, 2)}`;
  }

  const summary = `🔗 Found ${result.returned} links (${result.total_found} total on page):\n`;
  const currentDomain = result.current_domain ? `\n🌐 Current domain: ${result.current_domain}` : '';
  
  const linksList = result.links.map((link, index) => {
    const typeIcon = link.type === 'internal' ? '🏠' : '🌐';
    const linkText = link.text.length > 50 ? link.text.substring(0, 50) + '...' : link.text;
    const displayText = linkText || '[No text]';
    const title = link.title ? `\n   Title: ${link.title}` : '';
    const domain = link.domain ? ` [${link.domain}]` : '';
    
    return `${index + 1}. ${typeIcon} **${displayText}**${domain}${title}\n   URL: ${link.url}`;
  }).join('\n\n');

  const filterInfo = [];
  if (result.links.some(l => l.type === 'internal') && result.links.some(l => l.type === 'external')) {
    const internal = result.links.filter(l => l.type === 'internal').length;
    const external = result.links.filter(l => l.type === 'external').length;
    filterInfo.push(`📊 Internal: ${internal}, External: ${external}`);
  }
  
  const filterSummary = filterInfo.length > 0 ? `\n${filterInfo.join('\n')}` : '';
  
  return `${summary}${currentDomain}${filterSummary}\n\n${linksList}\n\n${JSON.stringify(metadata, null, 2)}`;
}

function formatTabCreateResult(result, metadata) {
  if (result.success) {
    return `✅ New tab created successfully
🆔 Tab ID: ${result.tab_id}
🌐 URL: ${result.url || 'about:blank'}
🎯 Active: ${result.active ? 'Yes' : 'No'}
📝 Title: ${result.title || 'New Tab'}
${result.warning ? `⚠️ Warning: ${result.warning}` : ''}

${JSON.stringify(metadata, null, 2)}`;
  } else {
    return `❌ Failed to create tab: ${result.error || 'Unknown error'}

${JSON.stringify(metadata, null, 2)}`;
  }
}

function formatTabCloseResult(result, metadata) {
  if (result.success) {
    const tabText = result.count === 1 ? 'tab' : 'tabs';
    return `✅ Successfully closed ${result.count} ${tabText}
🆔 Closed tab IDs: ${result.closed_tabs.join(', ')}

${JSON.stringify(metadata, null, 2)}`;
  } else {
    return `❌ Failed to close tabs: ${result.error || 'Unknown error'}

${JSON.stringify(metadata, null, 2)}`;
  }
}

function formatTabListResult(result, metadata) {
  if (!result.success || !result.tabs || result.tabs.length === 0) {
    return `📋 No tabs found

${JSON.stringify(metadata, null, 2)}`;
  }

  const summary = `📋 Found ${result.count} open tabs:
🎯 Active tab: ${result.active_tab || 'None'}

`;
  
  const tabsList = result.tabs.map((tab, index) => {
    const activeIcon = tab.active ? '🟢' : '⚪';
    const statusInfo = tab.status ? ` [${tab.status}]` : '';
    const pinnedInfo = tab.pinned ? ' 📌' : '';
    
    return `${index + 1}. ${activeIcon} **${tab.title}**${pinnedInfo}${statusInfo}
   🆔 ID: ${tab.id} | 🌐 ${tab.url}`;
  }).join('\n\n');

  return `${summary}${tabsList}

${JSON.stringify(metadata, null, 2)}`;
}

function formatTabSwitchResult(result, metadata) {
  if (result.success) {
    return `✅ Successfully switched to tab
🆔 Tab ID: ${result.tab_id}
📝 Title: ${result.title}
🌐 URL: ${result.url}
🏠 Window ID: ${result.window_id}

${JSON.stringify(metadata, null, 2)}`;
  } else {
    return `❌ Failed to switch tabs: ${result.error || 'Unknown error'}

${JSON.stringify(metadata, null, 2)}`;
  }
}

function formatElementStateResult(result, metadata) {
  const element = result.element_name || result.element_id || 'Unknown element';
  const state = result.state || {};
  
  let summary = `🔍 Element State: ${element}

📊 **Interaction Readiness**: ${state.interaction_ready ? '✅ Ready' : '❌ Not Ready'}

**Detailed State:**
• Disabled: ${state.disabled ? '❌ Yes' : '✅ No'}
• Visible: ${state.visible ? '✅ Yes' : '❌ No'}
• Clickable: ${state.clickable ? '✅ Yes' : '❌ No'}
• Focusable: ${state.focusable ? '✅ Yes' : '❌ No'}
• Has Text: ${state.hasText ? '✅ Yes' : '❌ No'}
• Is Empty: ${state.isEmpty ? '❌ Yes' : '✅ No'}`;

  if (result.current_value) {
    summary += `
📝 **Current Value**: "${result.current_value}"`;
  }

  return `${summary}

${JSON.stringify(metadata, null, 2)}`;
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
    // Tab Management Tools
    {
      name: "tab_create",
      description: "🆕 Create a new tab with optional URL and activation (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to open in the new tab (optional)"
          },
          active: {
            type: "boolean",
            default: true,
            description: "Whether to activate the new tab"
          },
          wait_for: {
            type: "string",
            description: "CSS selector to wait for after tab creation (if URL provided)"
          },
          timeout: {
            type: "number",
            default: 10000,
            description: "Maximum wait time in milliseconds"
          }
        }
      }
    },
    {
      name: "tab_close",
      description: "❌ Close specific tab(s) by ID or close current tab (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          tab_id: {
            type: "number",
            description: "Specific tab ID to close (optional, closes current tab if not provided)"
          },
          tab_ids: {
            type: "array",
            items: { type: "number" },
            description: "Array of tab IDs to close multiple tabs"
          }
        }
      }
    },
    {
      name: "tab_list",
      description: "📋 Get list of all open tabs with their details (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          current_window_only: {
            type: "boolean",
            default: true,
            description: "Only return tabs from the current window"
          },
          include_details: {
            type: "boolean",
            default: true,
            description: "Include additional tab details (title, favicon, etc.)"
          }
        }
      }
    },
    {
      name: "tab_switch",
      description: "🔄 Switch to a specific tab by ID (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          tab_id: {
            type: "number",
            description: "Tab ID to switch to"
          }
        },
        required: ["tab_id"]
      }
    },
    // Element State Tools
    {
      name: "element_get_state",
      description: "🔍 Get detailed state information for a specific element (disabled, clickable, etc.) (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description: "Element ID from page_analyze"
          }
        },
        required: ["element_id"]
      }
    },
    // Workspace and Reference Management Tools
    {
      name: "get_bookmarks",
      description: "Get all bookmarks or search for specific bookmarks (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query for bookmarks (optional)"
          }
        }
      }
    },
    {
      name: "add_bookmark",
      description: "Add a new bookmark (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Title of the bookmark"
          },
          url: {
            type: "string",
            description: "URL of the bookmark"
          },
          parentId: {
            type: "string",
            description: "ID of the parent folder (optional)"
          }
        },
        required: ["title", "url"]
      }
    },
    {
      name: "get_history",
      description: "🕒 Search browser history with comprehensive filters for finding previous work (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          keywords: {
            type: "string",
            description: "Search keywords to match in page titles and URLs"
          },
          start_date: {
            type: "string",
            format: "date-time",
            description: "Start date for history search (ISO 8601 format)"
          },
          end_date: {
            type: "string",
            format: "date-time",
            description: "End date for history search (ISO 8601 format)"
          },
          domains: {
            type: "array",
            items: { type: "string" },
            description: "Filter by specific domains"
          },
          min_visit_count: {
            type: "number",
            default: 1,
            description: "Minimum visit count threshold"
          },
          max_results: {
            type: "number",
            default: 50,
            maximum: 500,
            description: "Maximum number of results to return"
          },
          sort_by: {
            type: "string",
            enum: ["visit_time", "visit_count", "title"],
            default: "visit_time",
            description: "Sort results by visit time, visit count, or title"
          },
          sort_order: {
            type: "string",
            enum: ["desc", "asc"],
            default: "desc",
            description: "Sort order"
          }
        }
      }
    },
    {
      name: "get_selected_text",
      description: "📝 Get the currently selected text on the page (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          include_metadata: {
            type: "boolean",
            default: true,
            description: "Include metadata about the selection (element info, position, etc.)"
          },
          max_length: {
            type: "number",
            default: 10000,
            description: "Maximum length of text to return"
          }
        }
      }
    },
    {
      name: "page_scroll",
      description: "📜 Scroll the page in various directions - critical for long pages (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["up", "down", "left", "right", "top", "bottom"],
            default: "down",
            description: "Direction to scroll"
          },
          amount: {
            type: "string",
            enum: ["small", "medium", "large", "page", "custom"],
            default: "medium",
            description: "Amount to scroll"
          },
          pixels: {
            type: "number",
            description: "Custom pixel amount (when amount is 'custom')"
          },
          smooth: {
            type: "boolean",
            default: true,
            description: "Use smooth scrolling animation"
          },
          element_id: {
            type: "string",
            description: "Scroll to specific element (overrides direction/amount)"
          },
          wait_after: {
            type: "number",
            default: 500,
            description: "Milliseconds to wait after scrolling"
          }
        }
      }
    },
    {
      name: "get_page_links",
      description: "🔗 Get all hyperlinks on the current page with smart filtering (Extension required)",
      inputSchema: {
        type: "object",
        properties: {
          include_internal: {
            type: "boolean",
            default: true,
            description: "Include internal links (same domain)"
          },
          include_external: {
            type: "boolean",
            default: true,
            description: "Include external links (different domains)"
          },
          domain_filter: {
            type: "string",
            description: "Filter links to include only specific domain(s)"
          },
          max_results: {
            type: "number",
            default: 100,
            maximum: 500,
            description: "Maximum number of links to return"
          }
        }
      }
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

// ADD: SSE/HTTP endpoints for online AI
app.route('/sse')
  .get((req, res) => {
    // SSE stream for connection
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });

    res.write(`data: ${JSON.stringify({
      type: 'connection',
      status: 'connected',
      server: 'OpenDia MCP Server',
      version: '1.0.0'
    })}\n\n`);

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({
        type: 'heartbeat',
        timestamp: Date.now()
      })}\n\n`);
    }, 30000);

    req.on('close', () => {
      clearInterval(heartbeat);
      console.error('SSE client disconnected');
    });

    console.error('SSE client connected');
  })
  .post(async (req, res) => {
    // MCP requests from online AI
    console.error('MCP request received via SSE:', req.body);
    
    try {
      const result = await handleMCPRequest(req.body);
      res.json({
        jsonrpc: "2.0",
        id: req.body.id,
        result: result
      });
    } catch (error) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body.id,
        error: { code: -32603, message: error.message }
      });
    }
  });

// ADD: CORS preflight handler
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
  res.sendStatus(200);
});

// Read from stdin
let inputBuffer = "";
if (!sseOnly) {
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
}

// ADD: Health check endpoint (update existing one)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    chromeExtensionConnected: chromeExtensionSocket !== null,
    availableTools: availableTools.length,
    transport: sseOnly ? 'sse-only' : 'hybrid',
    tunnelEnabled: enableTunnel,
    features: [
      'Anti-detection bypass for Twitter/X, LinkedIn, Facebook',
      'Two-phase intelligent page analysis',
      'Smart content extraction with summarization',
      'Element state detection and interaction readiness',
      'Performance analytics and token optimization',
      'SSE transport for online AI services'
    ]
  });
});

// START: Enhanced server startup with optional tunneling
async function startServer() {
  console.error("🚀 Enhanced Browser MCP Server with Anti-Detection Features");
  
  // Start HTTP server
  const httpServer = app.listen(3001, () => {
    console.error("🌐 HTTP/SSE server running on port 3001");
    console.error("🔌 Waiting for Chrome Extension connection on ws://localhost:3000");
    console.error("🎯 Features: Anti-detection bypass + intelligent automation");
  });

  // Auto-tunnel if requested
  if (enableTunnel) {
    try {
      console.error('🔄 Starting automatic tunnel...');
      
      // Use the system ngrok binary directly
      const ngrokProcess = spawn('ngrok', ['http', '3001', '--log', 'stdout'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let tunnelUrl = null;
      
      // Wait for tunnel URL
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ngrokProcess.kill();
          reject(new Error('Tunnel startup timeout'));
        }, 10000);
        
        ngrokProcess.stdout.on('data', (data) => {
          const output = data.toString();
          const match = output.match(/url=https:\/\/[^\s]+/);
          if (match) {
            tunnelUrl = match[0].replace('url=', '');
            clearTimeout(timeout);
            resolve();
          }
        });
        
        ngrokProcess.stderr.on('data', (data) => {
          const error = data.toString();
          if (error.includes('error') || error.includes('failed')) {
            clearTimeout(timeout);
            ngrokProcess.kill();
            reject(new Error(error.trim()));
          }
        });
        
        ngrokProcess.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
      if (tunnelUrl) {
        console.error('');
        console.error('🎉 OPENDIA READY!');
        console.error('📋 Copy this URL for online AI services:');
        console.error(`🔗 ${tunnelUrl}/sse`);
        console.error('');
        console.error('💡 ChatGPT: Settings → Connectors → Custom Connector');
        console.error('💡 Claude Web: Add as external MCP server (if supported)');
        console.error('');
        console.error('🏠 Local access still available:');
        console.error('🔗 http://localhost:3001/sse');
        console.error('');
        
        // Store ngrok process for cleanup
        global.ngrokProcess = ngrokProcess;
      } else {
        throw new Error('Could not extract tunnel URL');
      }
      
    } catch (error) {
      console.error('❌ Tunnel failed:', error.message);
      console.error('');
      console.error('💡 MANUAL NGROK OPTION:');
      console.error('  1. Run: ngrok http 3001');
      console.error('  2. Use the ngrok URL + /sse');
      console.error('');
      console.error('💡 Or use local URL:');
      console.error('  🔗 http://localhost:3001/sse');
      console.error('');
    }
  } else {
    console.error('');
    console.error('🏠 LOCAL MODE:');
    console.error('🔗 SSE endpoint: http://localhost:3001/sse');
    console.error('💡 For online AI access, restart with --tunnel flag');
    console.error('');
  }

  // Display transport info
  if (sseOnly) {
    console.error('📡 Transport: SSE-only (stdio disabled)');
    console.error('💡 Configure Claude Desktop with: http://localhost:3001/sse');
  } else {
    console.error('📡 Transport: Hybrid (stdio + SSE)');
    console.error('💡 Claude Desktop: Works with existing config');
    console.error('💡 Online AI: Use SSE endpoint above');
  }
}

// Cleanup on exit
process.on('SIGINT', async () => {
  console.error('🔄 Shutting down...');
  if (enableTunnel && global.ngrokProcess) {
    console.error('🔄 Closing tunnel...');
    try {
      global.ngrokProcess.kill('SIGTERM');
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  process.exit();
});

// Start the server
startServer();
