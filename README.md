# OpenDia ✳️

OpenDia is an open alternative to Dia. Connect to your browser with MCP & do anything.
> Exposes browser functions through the Model Context Protocol (MCP), allowing AI models to interact with browser capabilities.

## ⚠️ Security Warning

**IMPORTANT**: This extension is provided as-is with no security guarantees. By using this extension, you acknowledge and accept the following risks:

- The extension requires broad browser permissions to function
- It establishes WebSocket connections to localhost
- It allows external applications to control browser functions
- We cannot guarantee the security of data transmitted through the extension
- Use at your own risk and only in trusted environments

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- Google Chrome browser

### Installation

1. **Set up the MCP Server**
   ```bash
   cd opendia-mcp
   npm install
   npm start
   ```

2. **Install the Chrome Extension**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the `opendia-extension` directory
   - The extension icon will appear in your browser toolbar

3. **Configure your MCP client**
   Add the browser server to your MCP configuration:
   ```json
   {
     "mcpServers": {
       "opendia": {
         "command": "node",
         "args": ["/path/to/opendia/opendia-mcp/server.js"],
         "env": {}
       }
     }
   }
   ```

## Enhanced MCP Tools (11 Total)

### 🎯 Core Automation Tools (7 Tools)

- **page_analyze**: Intelligent page analysis using pattern database + semantic analysis
  - Finds relevant elements based on user intent (e.g., "post_tweet", "search", "login")
  - Returns confidence-scored elements with stable IDs
  - Supports Twitter/X, GitHub, and universal patterns

- **page_extract_content**: Structured content extraction
  - Extract articles, search results, or social media posts
  - Smart content detection using semantic analysis
  - Returns structured data with metadata

- **element_click**: Reliable element clicking
  - Uses element IDs from page analysis
  - Supports different click types (left, right, double)
  - Auto-scrolls elements into view

- **element_fill**: Smart form filling with anti-detection bypass
  - Fill input fields and textareas with specialized bypasses for Twitter/X, LinkedIn, Facebook
  - Supports contenteditable elements
  - Uses platform-specific techniques to avoid bot detection

- **page_navigate**: Enhanced navigation
  - Navigate to URLs with optional wait conditions
  - Wait for specific elements to appear after navigation
  - Timeout handling and error reporting

- **page_wait_for**: Conditional waiting
  - Wait for elements to become visible
  - Wait for specific text to appear on page
  - Configurable timeout periods

- **browser_navigate**: URL navigation
  - Navigate to URLs in the active tab
  - Simple navigation tool for compatibility

### 📑 Tab Management Tools (4 Tools)

- **tab_create**: Create new tabs with advanced options
  - Create tabs with or without URLs
  - Control tab activation and focus
  - Wait for elements to load after creation
  - Perfect for multi-tab workflows

- **tab_close**: Close tabs with flexible targeting
  - Close current tab, specific tab by ID, or multiple tabs
  - Batch close operations for cleanup
  - Safe handling of tab closure

- **tab_list**: Get comprehensive tab information
  - List all open tabs with details (title, URL, status)
  - Filter by current window or all windows
  - Track active tab and tab states

- **tab_switch**: Switch between tabs intelligently
  - Switch to specific tabs by ID
  - Focus windows automatically
  - Essential for multi-tab automation workflows

### 🔧 State Management Tools (1 Tool)

- **element_get_state**: Get detailed state information for elements
  - Check if elements are disabled, clickable, visible
  - Get current values and element properties
  - Essential for conditional automation logic

## 🚀 Key Features

### Hybrid Intelligence Architecture
- **99% Local Operations**: Pattern database eliminates most LLM calls ($0 cost vs $20+/month)
- **Pattern Database**: Pre-built selectors for Twitter/X, GitHub, and common patterns
- **Semantic Analysis**: Fallback using HTML semantics and ARIA labels
- **Confidence Scoring**: Reliable element detection with quality metrics

### Visual Testing Interface
- **Real-time Testing**: Test content extraction and page analysis
- **Element Highlighting**: Visual feedback with confidence-based colors
- **Performance Metrics**: Execution time and data size monitoring
- **JSON Viewer**: Full result inspection and debugging

## Project Structure

```
opendia/
├── opendia-extension/     # Chrome extension files
│   ├── manifest.json     # Extension configuration
│   ├── background.js     # Background service worker
│   ├── content.js        # Content scripts
│   ├── popup.html        # Extension popup UI
│   └── popup.js          # Popup functionality
├── opendia-mcp/          # MCP server implementation
│   ├── package.json      # Server dependencies
│   ├── server.js         # MCP server logic
│   └── .env             # Environment configuration
└── README.md
```

## Contributing

1. **Adding New Browser Functions**
   - Add the tool definition in `getAvailableTools()` in background.js
   - Implement the handler in `handleMCPRequest()`
   - The tool will automatically be registered with the MCP server

2. **Development Workflow**
   - Modify extension files in the `opendia-extension` directory
   - Reload the extension in Chrome to see changes
   - Test new functionality through the MCP interface

3. **Security Considerations**
   - Review and limit permissions based on needs
   - The WebSocket server runs on localhost only by default
   - Be cautious when executing scripts or accessing sensitive data
   - Consider adding authentication between the extension and MCP server

## Troubleshooting

- **Extension not connecting**: Check that the MCP server is running on port 3000
- **Tools not available**: Verify the extension is loaded and check the popup for connection status
- **Permission errors**: Ensure the extension has the necessary permissions in manifest.json

## License

MIT License

## Disclaimer

This software is provided "as is", without warranty of any kind, express or implied. In no event shall the authors or copyright holders be liable for any claim, damages or other liability arising from the use of this software.
