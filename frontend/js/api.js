const API_BASE_URLS = (() => {
  const isLocalPage = window.location.protocol === 'file:'
    || ['localhost', '127.0.0.1', ''].includes(window.location.hostname);

  if (!isLocalPage || window.location.port === '3000') return [window.location.origin];
  return ['https://wage-sheet-generation-rinl-production.up.railway.app'];
})();

async function apiRequest(path, options = {}) {
  let lastNetworkError = null;

  for (const baseUrl of API_BASE_URLS) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || `Request failed: ${response.status}`);
      }
      return data || {};
    } catch (error) {
      if (error instanceof TypeError) {
        lastNetworkError = error;
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Cannot reach backend server at ${API_BASE_URLS.join(' or ')}. Make sure backend is running on port 3000.`);
}
