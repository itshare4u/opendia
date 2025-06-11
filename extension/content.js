// Content script for interacting with web pages
console.log('MCP Browser Bridge content script loaded');

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageInfo') {
    sendResponse({
      title: document.title,
      url: window.location.href,
      content: document.body.innerText
    });
  }
});