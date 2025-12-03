(function() {
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    const newOptions = {
      ...options,
      credentials: 'include'
    };
    return originalFetch.call(this, url, newOptions);
  };
})();
