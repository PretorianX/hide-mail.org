// AdSense configuration script - runs immediately
(function() {
  // This script runs immediately to prevent the placeholder script from loading
  
  // Function to get the client ID from runtime config
  function getClientId() {
    if (window.__RUNTIME_CONFIG__ && window.__RUNTIME_CONFIG__.adsense && window.__RUNTIME_CONFIG__.adsense.client) {
      return window.__RUNTIME_CONFIG__.adsense.client;
    }
    return '';
  }
  
  // Function to check if AdSense script is already loaded with the correct client ID
  function isAdSenseScriptLoaded(clientId) {
    var scripts = document.querySelectorAll('script[src*="adsbygoogle.js"]');
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].src.includes(clientId)) {
        return true;
      }
    }
    return false;
  }
  
  // Function to inject the correct AdSense script
  function injectAdSenseScript() {
    var clientId = getClientId();
    
    // Only proceed if we have a client ID
    if (clientId) {
      // Check if script is already loaded with the correct client ID
      if (isAdSenseScriptLoaded(clientId)) {
        console.log('AdSense script already loaded with correct client ID');
        return;
      }
      
      // Remove any existing placeholder scripts
      var existingScripts = document.querySelectorAll('script[src*="adsbygoogle.js"]');
      existingScripts.forEach(function(script) {
        if (script.src.includes('ca-pub-YOURPUBID') || !script.src.includes(clientId)) {
          script.parentNode.removeChild(script);
        }
      });
      
      // Create and inject the correct script
      var newScript = document.createElement('script');
      newScript.async = true;
      newScript.crossOrigin = "anonymous";
      newScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + clientId;
      document.head.appendChild(newScript);
      console.log('AdSense script injected with correct client ID');
    }
  }
  
  // Check if runtime config is already available
  if (window.__RUNTIME_CONFIG__) {
    injectAdSenseScript();
  } else {
    // If not, wait for runtime-env.js to load
    var originalOnload = window.onload;
    window.onload = function() {
      if (typeof originalOnload === 'function') {
        originalOnload();
      }
      injectAdSenseScript();
    };
    
    // Also set up a MutationObserver to watch for runtime config
    var observer = new MutationObserver(function(mutations) {
      if (window.__RUNTIME_CONFIG__) {
        injectAdSenseScript();
        observer.disconnect();
      }
    });
    
    observer.observe(document, { childList: true, subtree: true });
    
    // Set a timeout as a fallback
    setTimeout(function() {
      if (window.__RUNTIME_CONFIG__) {
        injectAdSenseScript();
      }
    }, 2000);
  }
})(); 