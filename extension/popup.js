// Popup script for status display
let logContainer = document.getElementById("log");
let statusIndicator = document.getElementById("statusIndicator");
let statusText = document.getElementById("statusText");
let toolCount = document.getElementById("toolCount");

// Get initial tool count
const tools = 13; // Number of tools we expose
toolCount.textContent = tools;

// Check connection status
function checkStatus() {
  if (chrome.runtime?.id) {
    chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error:", chrome.runtime.lastError);
        updateStatus(false);
        addLog("Error: Extension background script not responding");
      } else {
        updateStatus(response?.connected || false);
      }
    });
  } else {
    updateStatus(false);
    addLog("Error: Extension context invalid");
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
        addLog("Error: " + chrome.runtime.lastError.message);
      } else {
        addLog("Attempting to reconnect...");
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
        addLog("Error: " + chrome.runtime.lastError.message);
      } else {
        addLog("Sending test message...");
      }
    });
  }
});

// Add log entry
function addLog(message) {
  const entry = document.createElement("div");
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
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
  } else if (message.type === "log") {
    addLog(message.message);
  }
});
