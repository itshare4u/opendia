// Enhanced Popup with Testing Interface
let logContainer = document.getElementById("log");
let statusIndicator = document.getElementById("statusIndicator");
let statusText = document.getElementById("statusText");
let toolCount = document.getElementById("toolCount");
let currentPage = document.getElementById("currentPage");
let resultArea = document.getElementById("results");
let resultMeta = document.getElementById("result-meta");
let resultContent = document.getElementById("result-content");
let dataSizeInfo = document.getElementById("data-size");
let expandButton = document.getElementById("expand-results");
let jsonViewer = document.getElementById("json-viewer");

// Get initial tool count and page info
const tools = 8; // 6 core automation + 2 essential legacy tools
toolCount.textContent = tools;

// Check connection status and get page info
function checkStatus() {
  if (chrome.runtime?.id) {
    chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
      if (chrome.runtime.lastError) {
        updateStatus(false);
        addLog("Extension background script not responding", "error");
      } else {
        updateStatus(response?.connected || false);
      }
    });
    
    // Get current page info
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        const url = new URL(tabs[0].url);
        currentPage.textContent = url.hostname;
      }
    });
  } else {
    updateStatus(false);
    addLog("Extension context invalid", "error");
  }
}

// Check status on load and periodically
checkStatus();
setInterval(checkStatus, 2000);

// Update UI based on connection status
function updateStatus(connected) {
  if (connected) {
    statusIndicator.className = "status-indicator connected";
    statusText.textContent = "Connected to MCP server";
  } else {
    statusIndicator.className = "status-indicator disconnected";
    statusText.textContent = "Disconnected from MCP server";
  }
}

// Reconnect button
document.getElementById("reconnectBtn").addEventListener("click", () => {
  if (chrome.runtime?.id) {
    chrome.runtime.sendMessage({ action: "reconnect" }, (response) => {
      if (chrome.runtime.lastError) {
        addLog(chrome.runtime.lastError.message, "error");
      } else {
        addLog("Attempting to reconnect...", "info");
        setTimeout(checkStatus, 1000);
      }
    });
  }
});

// Test button
document.getElementById("testBtn").addEventListener("click", () => {
  if (chrome.runtime?.id) {
    chrome.runtime.sendMessage({ action: "test" }, (response) => {
      if (chrome.runtime.lastError) {
        addLog(chrome.runtime.lastError.message, "error");
      } else {
        addLog("Sending test message...", "info");
      }
    });
  }
});

// Testing Interface Functions
class TestingInterface {
  constructor() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById('test-extract').addEventListener('click', () => this.testExtraction());
    document.getElementById('test-analyze').addEventListener('click', () => this.testAnalysis());
    document.getElementById('highlight-elements').addEventListener('click', () => this.highlightElements());
    expandButton.addEventListener('click', () => this.toggleJsonViewer());
  }

  async testExtraction() {
    const contentType = document.getElementById('content-type').value;
    addLog(`🔍 Testing content extraction: ${contentType}`, "info");
    
    try {
      const result = await this.sendToContentScript({
        action: 'extract_content',
        data: { content_type: contentType }
      });
      
      this.displayResults(result, 'Content Extraction');
      addLog(`Extraction completed in ${result.execution_time}ms`, "success");
    } catch (error) {
      addLog(`Extraction failed: ${error.message}`, "error");
    }
  }

  async testAnalysis() {
    const intentHint = document.getElementById('intent-hint').value;
    if (!intentHint.trim()) {
      addLog('Please enter an intent hint', "error");
      return;
    }
    
    addLog(`🎯 Testing page analysis: ${intentHint}`, "info");
    
    try {
      const result = await this.sendToContentScript({
        action: 'analyze',
        data: { intent_hint: intentHint }
      });
      
      this.displayResults(result, 'Page Analysis');
      addLog(`Analysis completed in ${result.execution_time}ms`, "success");
    } catch (error) {
      addLog(`Analysis failed: ${error.message}`, "error");
    }
  }

  async highlightElements() {
    const intentHint = document.getElementById('intent-hint').value;
    if (!intentHint.trim()) {
      addLog('Please enter an intent hint to highlight elements', "error");
      return;
    }
    
    try {
      const result = await this.sendToContentScript({
        action: 'analyze',
        data: { intent_hint: intentHint }
      });
      
      if (result.success && result.data.elements?.length > 0) {
        // Inject highlighting script
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: this.highlightElementsOnPage,
            args: [result.data.elements]
          });
        });
        
        addLog(`🎯 Highlighted ${result.data.elements.length} elements`, "success");
      } else {
        addLog('No elements found to highlight', "error");
      }
    } catch (error) {
      addLog(`Highlighting failed: ${error.message}`, "error");
    }
  }

  highlightElementsOnPage(elements) {
    // Remove existing highlights
    document.querySelectorAll('.opendia-highlight').forEach(el => {
      el.classList.remove('opendia-highlight');
      el.style.removeProperty('outline');
    });
    
    // Add new highlights
    elements.forEach((elementData, index) => {
      try {
        const element = document.querySelector(elementData.selector);
        if (element) {
          element.classList.add('opendia-highlight');
          element.style.outline = `3px solid ${this.getHighlightColor(elementData.confidence)}`;
          element.style.outlineOffset = '2px';
          
          // Add tooltip
          element.title = `OpenDia: ${elementData.name} (${Math.round(elementData.confidence * 100)}%)`;
        }
      } catch (error) {
        console.warn('Failed to highlight element:', elementData.selector, error);
      }
    });
    
    // Auto-remove highlights after 10 seconds
    setTimeout(() => {
      document.querySelectorAll('.opendia-highlight').forEach(el => {
        el.classList.remove('opendia-highlight');
        el.style.removeProperty('outline');
        el.style.removeProperty('outline-offset');
        el.removeAttribute('title');
      });
    }, 10000);
  }

  getHighlightColor(confidence) {
    if (confidence > 0.8) return '#22c55e'; // Green for high confidence
    if (confidence > 0.6) return '#f59e0b'; // Orange for medium confidence
    return '#ef4444'; // Red for low confidence
  }

  async sendToContentScript(message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response.success) {
              resolve(response);
            } else {
              reject(new Error(response.error || 'Unknown error'));
            }
          });
        } else {
          reject(new Error('No active tab found'));
        }
      });
    });
  }

  displayResults(result, testType) {
    resultArea.classList.add('show');
    this.lastResult = result; // Store for JSON viewer
    
    // Display metadata with better formatting
    const method = result.data.method || 'N/A';
    const confidence = result.data.confidence ? Math.round(result.data.confidence * 100) + '%' : 'N/A';
    const elementsCount = result.data.elements ? result.data.elements.length : 0;
    
    resultMeta.innerHTML = `
      <strong>✅ ${testType}</strong><br>
      <small>
        📊 Method: <code>${method}</code> | 
        ⏱️ Time: <code>${result.execution_time}ms</code> | 
        🎯 Confidence: <code>${confidence}</code>
        ${elementsCount > 0 ? ` | 🔍 Elements: <code>${elementsCount}</code>` : ''}
      </small>
    `;
    
    // Display enhanced content preview
    const preview = this.createEnhancedPreview(result.data, testType);
    resultContent.innerHTML = preview;
    
    // Display size info
    this.displayDataSize(result);
    
    // Store full JSON for viewer
    this.updateJsonViewer(result);
  }

  createEnhancedPreview(data, testType) {
    if (testType === 'Page Analysis' && data.elements?.length > 0) {
      return this.createElementsPreview(data.elements);
    } else if (testType === 'Content Extraction' && data.content) {
      return this.createContentPreview(data.content, data.content_type);
    } else {
      return `<div style="color: #6b7280; font-style: italic;">No relevant data found</div>`;
    }
  }
  
  createElementsPreview(elements) {
    const maxElements = 5;
    const preview = elements.slice(0, maxElements).map(e => {
      const confidenceColor = e.confidence > 0.8 ? '#22c55e' : e.confidence > 0.6 ? '#f59e0b' : '#ef4444';
      return `
        <div style="margin: 4px 0; padding: 6px; background: #f9fafb; border-radius: 4px; border-left: 3px solid ${confidenceColor};">
          <strong>${e.name}</strong>
          <div style="font-size: 0.65rem; color: #6b7280; margin-top: 2px;">
            Type: ${e.type} | Confidence: ${Math.round(e.confidence * 100)}% | ID: ${e.id}
          </div>
          <div style="font-size: 0.6rem; color: #9ca3af; font-family: monospace; margin-top: 2px;">
            ${e.selector}
          </div>
        </div>
      `;
    }).join('');
    
    const remaining = elements.length - maxElements;
    const remainingText = remaining > 0 ? `<div style="color: #6b7280; font-size: 0.7rem; margin-top: 8px;">+ ${remaining} more elements...</div>` : '';
    
    return preview + remainingText;
  }
  
  createContentPreview(content, contentType) {
    if (typeof content === 'object') {
      if (content.title) {
        return `
          <div style="margin-bottom: 8px;">
            <strong>📰 ${content.title}</strong>
          </div>
          <div style="font-size: 0.65rem; color: #6b7280;">
            ${content.word_count ? `📝 Words: ${content.word_count}` : ''}
            ${content.reading_time ? ` | ⏱️ Read time: ${content.reading_time}min` : ''}
          </div>
          <div style="margin-top: 8px; font-size: 0.7rem; max-height: 60px; overflow: hidden;">
            ${(content.content || '').substring(0, 200)}${content.content?.length > 200 ? '...' : ''}
          </div>
        `;
      } else {
        return `<pre style="font-size: 0.65rem; max-height: 80px; overflow: hidden;">${JSON.stringify(content, null, 2).substring(0, 300)}</pre>`;
      }
    } else {
      return `<div style="max-height: 80px; overflow: hidden; font-size: 0.7rem;">${content.substring(0, 300)}${content.length > 300 ? '...' : ''}</div>`;
    }
  }

  displayDataSize(result) {
    const dataSize = result.data_size;
    const readableSize = this.formatBytes(dataSize);
    const tokenEstimate = Math.round(dataSize / 4); // Rough token estimate
    
    dataSizeInfo.innerHTML = `
      <span class="size-label">Data Size:</span>
      <span class="size-value ${dataSize > 10000 ? 'large' : 'normal'}">${readableSize}</span>
      <span class="compression-info">(~${tokenEstimate} tokens)</span>
    `;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  toggleJsonViewer() {
    if (jsonViewer.style.display === 'none') {
      jsonViewer.style.display = 'block';
      expandButton.textContent = '📄 Hide JSON';
      resultArea.classList.add('test-results-expanded');
    } else {
      jsonViewer.style.display = 'none';
      expandButton.textContent = '📄 View Full JSON';
      resultArea.classList.remove('test-results-expanded');
    }
  }
  
  updateJsonViewer(result) {
    const formattedJson = this.formatJson(result);
    jsonViewer.textContent = formattedJson;
  }
  
  formatJson(obj) {
    return JSON.stringify(obj, null, 2);
  }
}

// Initialize testing interface
const testingInterface = new TestingInterface();

// Add log entry
function addLog(message, type = "info") {
  const entry = document.createElement("div");
  entry.className = "log-entry";
  
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = `[${new Date().toLocaleTimeString()}]`;
  
  const content = document.createElement("span");
  content.textContent = message;
  
  if (type === "error") {
    content.style.color = "var(--error-color)";
  } else if (type === "success") {
    content.style.color = "var(--success-color)";
  }
  
  entry.appendChild(time);
  entry.appendChild(content);
  logContainer.appendChild(entry);

  // Keep only last 20 entries
  while (logContainer.children.length > 20) {
    logContainer.removeChild(logContainer.firstChild);
  }

  logContainer.scrollTop = logContainer.scrollHeight;
}

// Listen for updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "statusUpdate") {
    updateStatus(message.connected);
    if (message.connected) {
      addLog("Connected to MCP server", "success");
    } else {
      addLog("Disconnected from MCP server", "error");
    }
  } else if (message.type === "log") {
    addLog(message.message, message.type || "info");
  }
});