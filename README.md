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

## Available MCP Tools

Once connected, the following tools will be available through MCP:

- **browser_navigate**: Navigate to a URL
- **browser_get_tabs**: List all open tabs
- **browser_create_tab**: Create a new tab
- **browser_close_tab**: Close a specific tab
- **browser_execute_script**: Run JavaScript in the active tab
- **browser_get_page_content**: Extract text content from the page
- **browser_take_screenshot**: Capture a screenshot
- **browser_get_bookmarks**: Search bookmarks
- **browser_add_bookmark**: Create a new bookmark
- **browser_get_history**: Search browsing history
- **browser_get_cookies**: Get cookies for a domain
- **browser_fill_form**: Automatically fill form fields
- **browser_click_element**: Click elements on the page

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
