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
    
    // Tab Management Tools
    {
      name: "tab_create",
      description: "Create a new tab with optional URL and activation",
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
      description: "Close specific tab(s) by ID or close current tab",
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
      description: "Get list of all open tabs with their details",
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
      description: "Switch to a specific tab by ID",
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
    // Workspace and Reference Management Tools
    {
      name: "get_bookmarks",
      description: "Get all bookmarks or search for specific bookmarks",
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
      description: "Add a new bookmark",
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
      description: "Search browser history with comprehensive filters for finding previous work by date/keywords",
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
            description: "Filter by specific domains (e.g., ['github.com', 'stackoverflow.com'])"
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
            description: "Sort order (descending or ascending)"
          }
        }
      }
    },
    {
      name: "get_selected_text",
      description: "Get the currently selected text on the page",
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
      description: "Scroll the page in various directions and amounts - critical for long pages",
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
      description: "Get all hyperlinks on the current page with filtering options",
      inputSchema: {
        type: "object",
        properties: {
          link_type: {
            type: "string",
            enum: ["all", "internal", "external"],
            default: "all",
            description: "Filter by internal/external links"
          },
          domains: {
            type: "array",
            items: { type: "string" },
            description: "Filter by specific domains (optional)"
          },
          max_results: {
            type: "number",
            default: 50,
            maximum: 200,
            description: "Maximum links to return"
          }
        }
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
        
      // Tab management tools
      case "tab_create":
        result = await createTab(params);
        break;
      case "tab_close":
        result = await closeTabs(params);
        break;
      case "tab_list":
        result = await listTabs(params);
        break;
      case "tab_switch":
        result = await switchToTab(params.tab_id);
        break;
        
      // Element state tools
      case "element_get_state":
        result = await sendToContentScript('get_element_state', params);
        break;
      // Workspace and Reference Management Tools
      case "get_bookmarks":
        result = await getBookmarks(params);
        break;
      case "add_bookmark":
        result = await addBookmark(params);
        break;
      case "get_history":
        result = await getHistory(params);
        break;
      case "get_selected_text":
        result = await getSelectedText(params);
        break;
      case "page_scroll":
        result = await sendToContentScript('page_scroll', params);
        break;
      case "get_page_links":
        result = await sendToContentScript('get_page_links', params);
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
      } else if (response && response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || 'Unknown error'));
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

// Tab Management Functions
async function createTab(params) {
  const { url, active = true, wait_for, timeout = 10000 } = params;
  
  const createProperties = { active };
  if (url) {
    createProperties.url = url;
  }
  
  const newTab = await chrome.tabs.create(createProperties);
  
  // If URL was provided and wait_for is specified, wait for the element
  if (url && wait_for) {
    try {
      await waitForElement(newTab.id, wait_for, timeout);
    } catch (error) {
      return {
        success: true,
        tab_id: newTab.id,
        url: newTab.url,
        warning: `Tab created but wait condition failed: ${error.message}`
      };
    }
  }
  
  return {
    success: true,
    tab_id: newTab.id,
    url: newTab.url || 'about:blank',
    active: newTab.active,
    title: newTab.title || 'New Tab'
  };
}

async function closeTabs(params) {
  const { tab_id, tab_ids } = params;
  
  let tabsToClose = [];
  
  if (tab_ids && Array.isArray(tab_ids)) {
    // Close multiple tabs
    tabsToClose = tab_ids;
  } else if (tab_id) {
    // Close specific tab
    tabsToClose = [tab_id];
  } else {
    // Close current tab
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (activeTab) {
      tabsToClose = [activeTab.id];
    }
  }
  
  if (tabsToClose.length === 0) {
    throw new Error('No tabs specified to close');
  }
  
  // Close tabs
  await chrome.tabs.remove(tabsToClose);
  
  return {
    success: true,
    closed_tabs: tabsToClose,
    count: tabsToClose.length
  };
}

async function listTabs(params) {
  const { current_window_only = true, include_details = true } = params;
  
  const queryOptions = {};
  if (current_window_only) {
    queryOptions.currentWindow = true;
  }
  
  const tabs = await chrome.tabs.query(queryOptions);
  
  const tabList = tabs.map(tab => {
    const basicInfo = {
      id: tab.id,
      url: tab.url,
      active: tab.active,
      title: tab.title
    };
    
    if (include_details) {
      return {
        ...basicInfo,
        index: tab.index,
        pinned: tab.pinned,
        status: tab.status,
        favIconUrl: tab.favIconUrl,
        windowId: tab.windowId,
        incognito: tab.incognito
      };
    }
    
    return basicInfo;
  });
  
  return {
    success: true,
    tabs: tabList,
    count: tabList.length,
    active_tab: tabs.find(tab => tab.active)?.id || null
  };
}

async function switchToTab(tabId) {
  // First, get tab info to ensure it exists
  const tab = await chrome.tabs.get(tabId);
  
  if (!tab) {
    throw new Error(`Tab with ID ${tabId} not found`);
  }
  
  // Switch to the tab
  await chrome.tabs.update(tabId, { active: true });
  
  // Also focus the window containing the tab
  await chrome.windows.update(tab.windowId, { focused: true });
  
  return {
    success: true,
    tab_id: tabId,
    url: tab.url,
    title: tab.title,
    window_id: tab.windowId
  };
}

// Workspace and Reference Management Functions
async function getBookmarks(params) {
  const { query } = params;
  
  let bookmarks;
  if (query) {
    bookmarks = await chrome.bookmarks.search(query);
  } else {
    bookmarks = await chrome.bookmarks.getTree();
  }
  
  return {
    success: true,
    bookmarks,
    count: bookmarks.length
  };
}

async function addBookmark(params) {
  const { title, url, parentId } = params;
  
  const bookmark = await chrome.bookmarks.create({
    title,
    url,
    parentId
  });
  
  return {
    success: true,
    bookmark
  };
}

// History Management Function
async function getHistory(params) {
  const {
    keywords = "",
    start_date,
    end_date,
    domains = [],
    min_visit_count = 1,
    max_results = 50,
    sort_by = "visit_time",
    sort_order = "desc"
  } = params;

  try {
    // Chrome History API search configuration
    const searchQuery = {
      text: keywords,
      maxResults: Math.min(max_results * 3, 1000), // Over-fetch for filtering
    };

    // Add date range if specified
    if (start_date) {
      searchQuery.startTime = new Date(start_date).getTime();
    }
    if (end_date) {
      searchQuery.endTime = new Date(end_date).getTime();
    }

    // Execute history search
    const historyItems = await chrome.history.search(searchQuery);
    
    // Apply advanced filters
    let filteredItems = historyItems.filter(item => {
      // Domain filter
      if (domains.length > 0) {
        try {
          const itemDomain = new URL(item.url).hostname;
          if (!domains.some(domain => itemDomain.includes(domain))) {
            return false;
          }
        } catch (e) {
          // Skip items with invalid URLs
          return false;
        }
      }
      
      // Visit count filter
      if (item.visitCount < min_visit_count) {
        return false;
      }
      
      return true;
    });

    // Sort results
    filteredItems.sort((a, b) => {
      let aVal, bVal;
      switch (sort_by) {
        case "visit_count":
          aVal = a.visitCount;
          bVal = b.visitCount;
          break;
        case "title":
          aVal = (a.title || "").toLowerCase();
          bVal = (b.title || "").toLowerCase();
          break;
        default: // visit_time
          aVal = a.lastVisitTime;
          bVal = b.lastVisitTime;
      }
      
      if (sort_order === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // Limit results
    const results = filteredItems.slice(0, max_results);
    
    // Format response with comprehensive metadata
    return {
      success: true,
      history_items: results.map(item => {
        let domain;
        try {
          domain = new URL(item.url).hostname;
        } catch (e) {
          domain = "invalid-url";
        }
        
        return {
          id: item.id,
          url: item.url,
          title: item.title || "Untitled",
          last_visit_time: new Date(item.lastVisitTime).toISOString(),
          visit_count: item.visitCount,
          domain: domain,
          typed_count: item.typedCount || 0
        };
      }),
      metadata: {
        total_found: filteredItems.length,
        returned_count: results.length,
        search_params: {
          keywords: keywords || null,
          date_range: start_date && end_date ?
            `${start_date} to ${end_date}` :
            start_date ? `from ${start_date}` :
            end_date ? `until ${end_date}` : null,
          domains: domains.length > 0 ? domains : null,
          min_visit_count,
          sort_by,
          sort_order
        },
        execution_time: new Date().toISOString(),
        over_fetched: historyItems.length,
        filters_applied: {
          domain_filter: domains.length > 0,
          visit_count_filter: min_visit_count > 1,
          date_filter: !!(start_date || end_date),
          keyword_filter: !!keywords
        }
      }
    };

  } catch (error) {
    return {
      success: false,
      error: `History search failed: ${error.message}`,
      history_items: [],
      metadata: {
        total_found: 0,
        returned_count: 0,
        search_params: params,
        execution_time: new Date().toISOString()
      }
    };
  }
}

// Selected Text Management Function
async function getSelectedText(params) {
  const {
    include_metadata = true,
    max_length = 10000
  } = params;

  try {
    // Get the active tab
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    
    if (!activeTab) {
      return {
        success: false,
        error: "No active tab found",
        selected_text: "",
        metadata: {
          execution_time: new Date().toISOString()
        }
      };
    }

    // Execute script to get selected text
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: () => {
        const selection = window.getSelection();
        const selectedText = selection.toString();
        
        if (!selectedText) {
          return {
            text: "",
            hasSelection: false,
            metadata: null
          };
        }

        // Get metadata about the selection
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Get parent element info
        const commonAncestor = range.commonAncestorContainer;
        const parentElement = commonAncestor.nodeType === Node.TEXT_NODE
          ? commonAncestor.parentElement
          : commonAncestor;
        
        const metadata = {
          length: selectedText.length,
          word_count: selectedText.trim().split(/\s+/).filter(word => word.length > 0).length,
          line_count: selectedText.split('\n').length,
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          },
          parent_element: {
            tag_name: parentElement.tagName?.toLowerCase(),
            class_name: parentElement.className,
            id: parentElement.id,
            text_content_length: parentElement.textContent?.length || 0
          },
          page_info: {
            url: window.location.href,
            title: document.title,
            domain: window.location.hostname
          },
          selection_info: {
            anchor_offset: selection.anchorOffset,
            focus_offset: selection.focusOffset,
            range_count: selection.rangeCount,
            is_collapsed: selection.isCollapsed
          }
        };

        return {
          text: selectedText,
          hasSelection: true,
          metadata: metadata
        };
      }
    });

    const result = results[0]?.result;
    
    if (!result) {
      return {
        success: false,
        error: "Failed to execute selection script",
        selected_text: "",
        metadata: {
          execution_time: new Date().toISOString()
        }
      };
    }

    if (!result.hasSelection) {
      return {
        success: true,
        selected_text: "",
        has_selection: false,
        message: "No text is currently selected on the page",
        metadata: {
          execution_time: new Date().toISOString(),
          tab_info: {
            id: activeTab.id,
            url: activeTab.url,
            title: activeTab.title
          }
        }
      };
    }

    // Truncate text if it exceeds max_length
    let selectedText = result.text;
    let truncated = false;
    if (selectedText.length > max_length) {
      selectedText = selectedText.substring(0, max_length);
      truncated = true;
    }

    const response = {
      success: true,
      selected_text: selectedText,
      has_selection: true,
      character_count: result.text.length,
      truncated: truncated,
      metadata: {
        execution_time: new Date().toISOString(),
        tab_info: {
          id: activeTab.id,
          url: activeTab.url,
          title: activeTab.title
        }
      }
    };

    // Include detailed metadata if requested
    if (include_metadata && result.metadata) {
      response.selection_metadata = result.metadata;
    }

    return response;

  } catch (error) {
    return {
      success: false,
      error: `Failed to get selected text: ${error.message}`,
      selected_text: "",
      has_selection: false,
      metadata: {
        execution_time: new Date().toISOString(),
        error_details: error.stack
      }
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
  } else if (request.action === "getToolCount") {
    const tools = getAvailableTools();
    sendResponse({
      toolCount: tools.length,
      tools: tools.map(t => t.name)
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
