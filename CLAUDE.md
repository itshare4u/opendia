# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenDia is a browser automation tool that provides an open alternative to Dia, enabling AI models to interact with browsers through the Model Context Protocol (MCP). The project consists of two main components:

1. **Chrome Extension** (`opendia-extension/`) - Provides browser automation capabilities
2. **MCP Server** (`opendia-mcp/`) - Bridges the extension to AI models via WebSocket

## Architecture

The system uses a hybrid intelligence architecture:
- **Pattern Database**: Pre-built selectors for Twitter/X, GitHub, and common patterns (99% local operations)
- **Semantic Analysis**: Fallback using HTML semantics and ARIA labels when patterns fail
- **WebSocket Bridge**: Real-time communication between extension and MCP server on port 3000

### Core Components

- `background.js:44-213` - Defines 17 MCP tools for page analysis, content extraction, element interaction, tab management, and data access
- `content.js:4-95` - Enhanced pattern database with confidence-scored selectors for known sites
- `server.js:14-143` - MCP protocol implementation with tool registration and WebSocket handling

## Development Commands

### MCP Server
```bash
cd opendia-mcp
npm install
npm start  # Starts server on ws://localhost:3000
```

### Chrome Extension
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select `opendia-extension` directory
4. Extension will auto-connect to MCP server

### Health Check
```bash
curl http://localhost:3001/health  # Check server and extension status
```

## MCP Tool Categories

### Web Browser Automation Tools (8 tools)
- `page_analyze` - **Two-phase intelligent analysis** with element state detection
  - Phase 1 (`discover`): Quick scan with element state (enabled/disabled, clickable)
  - Phase 2 (`detailed`): Full analysis with element fingerprinting and interaction readiness
  - Enhanced pattern database with auth, content, search, nav, and form categories
- `page_extract_content` - **Smart content extraction with summarization**
  - Intelligent content detection for articles, search results, and social posts
  - Token-efficient summaries with quality metrics and sample items
  - Site-specific extraction patterns for Twitter/X, GitHub, Google
- `element_click` - Click elements with auto-scroll and wait conditions
- `element_fill` - **Enhanced form filling** with proper focus simulation
  - Natural focus sequence: click → focus → fill for modern web apps
  - Comprehensive event simulation (beforeinput, input, change, composition)
  - Validation of successful fill with actual value verification
- `element_get_state` - Get detailed element state (disabled, clickable, focusable, empty)
- `page_navigate` - Navigate with optional element wait conditions  
- `page_wait_for` - Wait for elements or text to appear
- `page_scroll` - Scroll pages in various directions

### Tab Management Tools (4 tools)
- `tab_create` - Create new tabs with advanced options
- `tab_close` - Close tabs with flexible targeting
- `tab_list` - Get comprehensive tab information
- `tab_switch` - Switch between tabs intelligently

### Browser Data Access Tools (5 tools)  
- `get_bookmarks` - Get all bookmarks or search for specific ones
- `add_bookmark` - Add new bookmarks with folder support
- `get_history` - Search browser history with comprehensive filters
- `get_selected_text` - Get currently selected text with rich metadata
- `get_page_links` - Get all hyperlinks with filtering options

## Key Implementation Details

### Phase 1 & 2 Token Efficiency Improvements
- **Element Fingerprinting** (`content.js:771-778`): Compact representation using `tag.class@context.position` format
- **Two-Phase Analysis** (`content.js:203-323`): Quick discovery vs detailed analysis with separate registries
- **Enhanced Pattern Database** (`content.js:4-95`): Intent-based categorization (auth, content, search, nav, form)
- **Viewport-Aware Analysis** (`content.js:838-859`): Intersection observer for visibility detection
- **Intelligent Element Scoring** (`content.js:861-869`): Confidence-based filtering and ranking

### Phase 2 Content & Performance Optimization
- **Smart Content Summarization** (`content.js:662-717`): Token-efficient summaries instead of full content
- **Site-Specific Extractors** (`content.js:603-659`): Pattern-based extraction for Twitter/X, GitHub, Google
- **Token Usage Tracking** (`content.js:115-263`): Performance metrics with localStorage persistence
- **Adaptive Optimization** (`content.js:152-166`): Auto-adjustment of limits based on success rates
- **Method Performance Tracking** (`content.js:188-211`): Success rate optimization per page type/intent

### Focus & State Enhancement (Latest)
- **Enhanced Focus Simulation** (`content.js:1218-1254`): Mouse events + focus + React state update
- **Element State Detection** (`content.js:1311-1409`): Comprehensive disabled/clickable/focusable analysis
- **Event Sequence Simulation** (`content.js:1270-1299`): beforeinput, input, change, composition events
- **Modern Web App Support**: Handles React, Vue, Angular state management requirements

### Core Architecture  
- Element IDs generated dynamically with dual registries for quick/detailed phases
- Pattern matching prioritizes enhanced patterns → legacy patterns → semantic analysis
- WebSocket connection includes ping/pong heartbeat every 30 seconds
- Tool responses include execution time, confidence metrics, and token estimates
- CSP-aware JavaScript execution with multiple fallback strategies

## Security Considerations

The extension requires broad permissions (`<all_urls>`, tabs, scripting) and establishes localhost WebSocket connections. This is intentional for automation capabilities but should only be used in trusted environments.

## Testing

Use the extension popup to test connection status and tool availability. The MCP server provides real-time status via WebSocket connection state and tool registration logs.