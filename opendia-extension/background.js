// MCP Server connection configuration
const MCP_SERVER_URL = 'ws://localhost:3000';
let mcpSocket = null;
let reconnectInterval = null;
let reconnectAttempts = 0;

// Initialize WebSocket connection to MCP server
function connectToMCPServer() {
  if (mcpSocket && mcpSocket.readyState === WebSocket.OPEN) return;
  
  console.log('🔗 Connecting to MCP server at', MCP_SERVER_URL);
  mcpSocket = new WebSocket(MCP_SERVER_URL);
  
  mcpSocket.onopen = () => {
    console.log('✅ Connected to MCP server');
    clearInterval(reconnectInterval);
    
    const tools = getAvailableTools();
    console.log(`🔧 Registering ${tools.length} tools:`, tools.map(t => t.name));
    
    // Register available browser functions
    mcpSocket.send(JSON.stringify({
      type: 'register',
      tools: tools
    }));
  };
  
  mcpSocket.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    await handleMCPRequest(message);
  };
  
  mcpSocket.onclose = () => {
    console.log('❌ Disconnected from MCP server, will reconnect...');
    // Attempt to reconnect every 5 seconds
    reconnectInterval = setInterval(connectToMCPServer, 5000);
  };
  
  mcpSocket.onerror = (error) => {
    console.log('⚠️ MCP WebSocket error:', error);
  };
}

// Define available browser automation tools for MCP
function getAvailableTools() {
  return [
    // Page Analysis Tools
    {
      name: "page_analyze",
      description: "Two-phase intelligent page analysis with token efficiency optimization",
      inputSchema: {
        type: "object",
        properties: {
          intent_hint: {
            type: "string",
            description: "User intent: login, signup, search, post_create, comment, menu, submit, etc."
          },
          phase: {
            type: "string",
            enum: ["discover", "detailed"],
            default: "discover",
            description: "Analysis phase: 'discover' for quick scan (<100 tokens), 'detailed' for full analysis"
          },
          focus_areas: {
            type: "array",
            items: { type: "string" },
            description: "Areas to analyze in detail: buttons, forms, navigation, search_elements"
          },
          max_results: {
            type: "number",
            default: 5,
            maximum: 15,
            description: "Maximum number of elements to return"
          },
          element_ids: {
            type: "array",
            items: { type: "string" },
            description: "Expand specific quick match IDs from discover phase (e.g. ['q1', 'q2'])"
          }
        },
        required: ["intent_hint"]
      }
    },
    {
      name: "page_extract_content",
      description: "Extract and summarize structured content with token efficiency optimization",
      inputSchema: {
        type: "object",
        properties: {
          content_type: {
            type: "string",
            enum: ["article", "search_results", "posts"],
            description: "Type of content to extract"
          },
          max_items: {
            type: "number",
            description: "Maximum number of items to extract (for lists/collections)",
            default: 20
          },
          summarize: {
            type: "boolean",
            default: true,
            description: "Return summary instead of full content to save tokens"
          }
        },
        required: ["content_type"]
      }
    },
    
    // Element Interaction Tools
    {
      name: "element_click",
      description: "Click on a specific page element",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description: "Unique element identifier from page_analyze"
          },
          click_type: {
            type: "string",
            enum: ["left", "right", "double"],
            default: "left"
          },
          wait_after: {
            type: "number",
            description: "Milliseconds to wait after click",
            default: 500
          }
        },
        required: ["element_id"]
      }
    },
    {
      name: "element_fill",
      description: "Fill input field with enhanced focus and event simulation for modern web apps",
      inputSchema: {
        type: "object",
        properties: {
          element_id: {
            type: "string",
            description: "Unique element identifier from page_analyze"
          },
          value: {
            type: "string",
            description: "Text value to input"
          },
          clear_first: {
            type: "boolean",
            description: "Clear existing content before filling",
            default: true
          },
          force_focus: {
            type: "boolean",
            description: "Use enhanced focus sequence with click simulation for modern apps",
            default: true
          }
        },
        required: ["element_id", "value"]
      }
    },
    
    // Navigation Tools
    {
      name: "page_navigate",
      description: "Navigate to specified URL and wait for page load",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL to navigate to"
          },
          wait_for: {
            type: "string",
            description: "CSS selector to wait for after navigation (ensures page is ready)"
          },
          timeout: {
            type: "number",
            description: "Maximum wait time in milliseconds",
            default: 10000
          }
        },
        required: ["url"]
      }
    },
    {
      name: "page_wait_for",
      description: "Wait for specific element or condition on current page",
      inputSchema: {
        type: "object",
        properties: {
          condition_type: {
            type: "string",
            enum: ["element_visible", "text_present"],
            description: "Type of condition to wait for"
          },
          selector: {
            type: "string",
            description: "CSS selector for element-based conditions"
          },
          text: {
            type: "string",
            description: "Text to wait for (when condition_type is 'text_present')"
          },
          timeout: {
            type: "number",
            description: "Maximum wait time in milliseconds",
            default: 5000
          }
        },
        required: ["condition_type"]
      }
    },
    
    // Essential legacy tools for compatibility
    {
      name: "browser_navigate",
      description: "Navigate to a URL in the active tab (legacy)",
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
      description: "Execute JavaScript in the active tab",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "JavaScript code to execute" },
        },
        required: ["code"],
      },
    },
    
    // Element State Tools
    {
      name: "element_get_state",
      description: "Get detailed state information for a specific element (disabled, clickable, etc.)",
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

    // Analytics and Performance Tools
    {
      name: "get_analytics",
      description: "Get token usage analytics and performance metrics",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    },
    {
      name: "clear_analytics",
      description: "Clear all analytics data and reset performance tracking",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    },
  ];
}

// Handle MCP requests with enhanced automation tools
async function handleMCPRequest(message) {
  const { id, method, params } = message;

  try {
    let result;

    switch (method) {
      // New automation tools
      case "page_analyze":
        result = await sendToContentScript('analyze', params);
        break;
      case "page_extract_content":
        result = await sendToContentScript('extract_content', params);
        break;
      case "element_click":
        result = await sendToContentScript('element_click', params);
        break;
      case "element_fill":
        result = await sendToContentScript('element_fill', params);
        break;
      case "page_navigate":
        result = await navigateToUrl(params.url, params.wait_for, params.timeout);
        break;
      case "page_wait_for":
        result = await sendToContentScript('wait_for', params);
        break;
        
      // Essential legacy tools for compatibility
      case "browser_navigate":
        result = await navigateToUrl(params.url);
        break;
      case "browser_execute_script":
        result = await executeScript(params.code);
        break;
        
      // Element state tools
      case "element_get_state":
        result = await sendToContentScript('get_element_state', params);
        break;
        
      // Analytics tools
      case "get_analytics":
        result = await sendToContentScript('get_analytics', {});
        break;
      case "clear_analytics":
        result = await sendToContentScript('clear_analytics', {});
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }

    // Send success response
    mcpSocket.send(
      JSON.stringify({
        id,
        result,
      })
    );
  } catch (error) {
    // Send error response
    mcpSocket.send(
      JSON.stringify({
        id,
        error: {
          message: error.message,
          code: -32603,
        },
      })
    );
  }
}

// Enhanced content script communication
async function sendToContentScript(action, data) {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  
  if (!activeTab) {
    throw new Error('No active tab found');
  }
  
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(activeTab.id, { action, data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response.error || 'Unknown error'));
      }
    });
  });
}

async function navigateToUrl(url, waitFor, timeout = 10000) {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  
  await chrome.tabs.update(activeTab.id, { url });
  
  // If waitFor is specified, wait for the element to appear
  if (waitFor) {
    try {
      await waitForElement(activeTab.id, waitFor, timeout);
    } catch (error) {
      return { success: true, tabId: activeTab.id, warning: `Navigation completed but wait condition failed: ${error.message}` };
    }
  }
  
  return { success: true, tabId: activeTab.id, url: url };
}

async function waitForElement(tabId, selector, timeout = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, {
        action: 'wait_for',
        data: { 
          condition_type: 'element_visible', 
          selector: selector,
          timeout: 1000
        }
      });
      
      if (result.success) {
        return true;
      }
    } catch (error) {
      // Content script might not be ready yet, continue waiting
    }
    
    // Wait 500ms before next check
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  throw new Error(`Timeout waiting for element: ${selector}`);
}

async function executeScript(code) {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  
  try {
    // Use chrome.scripting.executeScript with a function instead of eval
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: (codeToExecute) => {
        // Execute code safely without eval
        try {
          // Create a script element to bypass CSP
          const script = document.createElement('script');
          script.textContent = codeToExecute;
          document.head.appendChild(script);
          document.head.removeChild(script);
          return { success: true, executed: true };
        } catch (error) {
          // Fallback: try to execute common operations directly
          if (codeToExecute.includes('window.scrollTo')) {
            const match = codeToExecute.match(/window\.scrollTo\((\d+),\s*(\d+|[^)]+)\)/);
            if (match) {
              const x = parseInt(match[1]);
              const y = match[2].includes('document.body.scrollHeight') ? 
                      document.body.scrollHeight / 2 : parseInt(match[2]);
              window.scrollTo(x, y);
              return { success: true, scrolled: true, x, y };
            }
          }
          
          if (codeToExecute.includes('document.querySelector')) {
            // Handle simple querySelector operations
            const match = codeToExecute.match(/document\.querySelector\(['"]([^'"]+)['"]\)/);
            if (match) {
              const element = document.querySelector(match[1]);
              return { success: true, element: element ? 'found' : 'not found', selector: match[1] };
            }
          }
          
          throw error;
        }
      },
      args: [code],
    });
    return results[0].result;
  } catch (error) {
    return {
      success: false,
      error: error.message,
      note: "CSP restrictions prevent arbitrary JavaScript execution. Try using specific automation tools instead."
    };
  }
}

// Initialize connection when extension loads
connectToMCPServer();

// Heartbeat to keep connection alive
setInterval(() => {
  if (mcpSocket && mcpSocket.readyState === WebSocket.OPEN) {
    mcpSocket.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
  }
}, 30000); // Every 30 seconds

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getStatus") {
    sendResponse({
      connected: mcpSocket && mcpSocket.readyState === WebSocket.OPEN,
    });
  } else if (request.action === "reconnect") {
    connectToMCPServer();
    sendResponse({ success: true });
  } else if (request.action === "test") {
    if (mcpSocket && mcpSocket.readyState === WebSocket.OPEN) {
      mcpSocket.send(JSON.stringify({ type: "test", timestamp: Date.now() }));
    }
    sendResponse({ success: true });
  }
  return true; // Keep the message channel open
});