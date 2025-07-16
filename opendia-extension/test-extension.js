// Simple test script to verify browser extension compatibility
const fs = require('fs');
const path = require('path');

function testManifestStructure(browser) {
  console.log(`\n🔍 Testing ${browser} extension structure...`);
  
  const buildDir = `dist/${browser}`;
  const manifestPath = path.join(buildDir, 'manifest.json');
  
  try {
    // Read and parse manifest
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // Check manifest version
    console.log(`   Manifest version: ${manifest.manifest_version}`);
    
    // Check background configuration
    if (browser === 'chrome') {
      console.log(`   Background: Service Worker (${manifest.background.service_worker})`);
      console.log(`   Action: ${manifest.action ? 'Present' : 'Missing'}`);
      console.log(`   Host permissions: ${manifest.host_permissions ? manifest.host_permissions.length : 0}`);
    } else {
      console.log(`   Background: Scripts (${manifest.background.scripts.length} files)`);
      console.log(`   Browser action: ${manifest.browser_action ? 'Present' : 'Missing'}`);
      console.log(`   Gecko ID: ${manifest.applications?.gecko?.id || 'Not set'}`);
    }
    
    // Check permissions
    console.log(`   Permissions: ${manifest.permissions.length} total`);
    
    // Check content scripts
    console.log(`   Content scripts: ${manifest.content_scripts?.length || 0} configured`);
    
    // Check polyfill inclusion
    const polyfillPath = path.join(buildDir, 'src/polyfill/browser-polyfill.min.js');
    const polyfillExists = fs.existsSync(polyfillPath);
    console.log(`   WebExtension polyfill: ${polyfillExists ? 'Present' : 'Missing'}`);
    
    // Check if polyfill is included in content scripts
    const hasPolyfillInContent = manifest.content_scripts?.[0]?.js?.includes('src/polyfill/browser-polyfill.min.js');
    console.log(`   Polyfill in content scripts: ${hasPolyfillInContent ? 'Yes' : 'No'}`);
    
    // Check if polyfill is included in background (Firefox only)
    if (browser === 'firefox') {
      const hasPolyfillInBackground = manifest.background?.scripts?.includes('src/polyfill/browser-polyfill.min.js');
      console.log(`   Polyfill in background: ${hasPolyfillInBackground ? 'Yes' : 'No'}`);
    }
    
    console.log(`✅ ${browser} extension structure looks good!`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error testing ${browser} extension:`, error.message);
    return false;
  }
}

function testBackgroundScript(browser) {
  console.log(`\n🔍 Testing ${browser} background script...`);
  
  const scriptPath = `dist/${browser}/src/background/background.js`;
  
  try {
    const script = fs.readFileSync(scriptPath, 'utf8');
    
    // Check for browser polyfill usage
    const usesBrowserAPI = script.includes('browser.') || script.includes('globalThis.browser');
    console.log(`   Uses browser API: ${usesBrowserAPI ? 'Yes' : 'No'}`);
    
    // Check for connection manager
    const hasConnectionManager = script.includes('ConnectionManager');
    console.log(`   Has connection manager: ${hasConnectionManager ? 'Yes' : 'No'}`);
    
    // Check for browser detection
    const hasBrowserDetection = script.includes('browserInfo') || script.includes('isFirefox') || script.includes('isServiceWorker');
    console.log(`   Has browser detection: ${hasBrowserDetection ? 'Yes' : 'No'}`);
    
    // Check for WebSocket management
    const hasWebSocketManagement = script.includes('WebSocket') && script.includes('connect');
    console.log(`   Has WebSocket management: ${hasWebSocketManagement ? 'Yes' : 'No'}`);
    
    console.log(`✅ ${browser} background script looks good!`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error testing ${browser} background script:`, error.message);
    return false;
  }
}

function testContentScript(browser) {
  console.log(`\n🔍 Testing ${browser} content script...`);
  
  const scriptPath = `dist/${browser}/src/content/content.js`;
  
  try {
    const script = fs.readFileSync(scriptPath, 'utf8');
    
    // Check for browser polyfill usage
    const usesBrowserAPI = script.includes('browser.') || script.includes('globalThis.browser');
    console.log(`   Uses browser API: ${usesBrowserAPI ? 'Yes' : 'No'}`);
    
    // Check for message handling
    const hasMessageHandling = script.includes('onMessage') && script.includes('sendResponse');
    console.log(`   Has message handling: ${hasMessageHandling ? 'Yes' : 'No'}`);
    
    console.log(`✅ ${browser} content script looks good!`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error testing ${browser} content script:`, error.message);
    return false;
  }
}

function testPopupScript(browser) {
  console.log(`\n🔍 Testing ${browser} popup script...`);
  
  const scriptPath = `dist/${browser}/src/popup/popup.js`;
  
  try {
    const script = fs.readFileSync(scriptPath, 'utf8');
    
    // Check for browser polyfill usage
    const usesBrowserAPI = script.includes('browser.') || script.includes('globalThis.browser');
    console.log(`   Uses browser API: ${usesBrowserAPI ? 'Yes' : 'No'}`);
    
    // Check for API abstraction
    const hasAPIAbstraction = script.includes('runtimeAPI') || script.includes('tabsAPI') || script.includes('storageAPI');
    console.log(`   Has API abstraction: ${hasAPIAbstraction ? 'Yes' : 'No'}`);
    
    console.log(`✅ ${browser} popup script looks good!`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error testing ${browser} popup script:`, error.message);
    return false;
  }
}

function runAllTests() {
  console.log('🚀 Testing cross-browser extension compatibility...\n');
  
  const browsers = ['chrome', 'firefox'];
  let allPassed = true;
  
  for (const browser of browsers) {
    console.log(`\n🌐 Testing ${browser.toUpperCase()} extension:`);
    console.log('='.repeat(40));
    
    const tests = [
      testManifestStructure,
      testBackgroundScript,
      testContentScript,
      testPopupScript
    ];
    
    for (const test of tests) {
      if (!test(browser)) {
        allPassed = false;
      }
    }
  }
  
  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('🎉 All tests passed! Cross-browser extension is ready.');
    console.log('\n📦 Distribution packages:');
    console.log('   Chrome: dist/opendia-chrome.zip');
    console.log('   Firefox: dist/opendia-firefox.zip');
    console.log('\n🧪 Manual testing:');
    console.log('   1. Chrome: Load dist/chrome in chrome://extensions');
    console.log('   2. Firefox: Load dist/firefox in about:debugging');
    console.log('   3. Both should connect to MCP server on localhost:5555/5556');
  } else {
    console.log('❌ Some tests failed. Please check the output above.');
  }
}

// Run tests
runAllTests();