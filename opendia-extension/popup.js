// OpenDia Popup
let statusIndicator = document.getElementById("statusIndicator");
let statusText = document.getElementById("statusText");
let toolCount = document.getElementById("toolCount");
let currentPage = document.getElementById("currentPage");

// Get dynamic tool count from background script
function updateToolCount() {
  const toolsList = [
    "page_analyze", "page_extract_content", "element_click", "element_fill",
    "element_get_state", "page_navigate", "page_wait_for", "page_scroll",
    "tab_create", "tab_close", "tab_list", "tab_switch",
    "get_bookmarks", "add_bookmark", "get_history", "get_selected_text", "get_page_links"
  ];
  
  if (chrome.runtime?.id) {
    chrome.runtime.sendMessage({ action: "getToolCount" }, (response) => {
      if (!chrome.runtime.lastError && response?.toolCount) {
        toolCount.innerHTML = `<span class="tooltip">${response.toolCount}
          <span class="tooltip-content">Available MCP Tools:\npage_analyze • page_extract_content • element_click • element_fill • element_get_state • page_navigate • page_wait_for • page_scroll • tab_create • tab_close • tab_list • tab_switch • get_bookmarks • add_bookmark • get_history • get_selected_text • get_page_links</span>
        </span>`;
      } else {
        // Fallback to calculating from background script
        toolCount.innerHTML = `<span class="tooltip">17
          <span class="tooltip-content">Available MCP Tools:\npage_analyze • page_extract_content • element_click • element_fill • element_get_state • page_navigate • page_wait_for • page_scroll • tab_create • tab_close • tab_list • tab_switch • get_bookmarks • add_bookmark • get_history • get_selected_text • get_page_links</span>
        </span>`;
      }
    });
  }
}

// Check connection status and get page info
function checkStatus() {
  if (chrome.runtime?.id) {
    chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
      if (chrome.runtime.lastError) {
        updateStatus(false);
      } else {
        updateStatus(response?.connected || false);
      }
    });
    
    // Update tool count
    updateToolCount();
    
    // Get current page info
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]) {
        const url = new URL(tabs[0].url);
        currentPage.textContent = url.hostname;
      }
    });
  } else {
    updateStatus(false);
  }
}

// Check status on load and periodically
checkStatus();
setInterval(checkStatus, 2000);

// Update UI based on connection status
function updateStatus(connected) {
  if (connected) {
    statusIndicator.className = "status-indicator connected";
    statusText.innerHTML = `Connected to MCP server
      <span class="tooltip-content">Make sure your MCP server is connected. If it's the case, click on Reconnect. If it still don't work, kill your 3000 port & try again.</span>`;
  } else {
    statusIndicator.className = "status-indicator disconnected";
    statusText.innerHTML = `Disconnected from MCP server
      <span class="tooltip-content">Make sure your MCP server is connected. If it's the case, click on Reconnect. If it still don't work, kill your 3000 port & try again.</span>`;
  }
}

// Reconnect button
document.getElementById("reconnectBtn").addEventListener("click", () => {
  if (chrome.runtime?.id) {
    chrome.runtime.sendMessage({ action: "reconnect" }, (response) => {
      if (!chrome.runtime.lastError) {
        setTimeout(checkStatus, 1000);
      }
    });
  }
});


// Listen for updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "statusUpdate") {
    updateStatus(message.connected);
  }
});

// Video speed control based on mouse movement
const logoVideo = document.querySelector('.logo video');
let mouseTimeout;
let lastMouseX = 0;
let lastMouseY = 0;
let mouseSpeed = 0;

if (logoVideo) {
  // Track mouse movement and calculate speed
  document.addEventListener('mousemove', (e) => {
    const deltaX = e.clientX - lastMouseX;
    const deltaY = e.clientY - lastMouseY;
    
    // Calculate mouse speed (distance moved)
    mouseSpeed = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Update video playback rate based on mouse speed
    // Faster mouse = faster video (clamped between 0.2x and 10x)
    // Very sensitive to mouse movement (divided by 15 for more responsiveness)
    const playbackRate = Math.min(10, Math.max(0.2, 1 + (mouseSpeed / 15)));
    logoVideo.playbackRate = playbackRate;
    
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    
    // Clear existing timeout
    clearTimeout(mouseTimeout);
    
    // Reset to normal speed after mouse stops
    mouseTimeout = setTimeout(() => {
      logoVideo.playbackRate = 1;
    }, 100);
  });
  
  // Set initial playback rate
  logoVideo.playbackRate = 1;
}

