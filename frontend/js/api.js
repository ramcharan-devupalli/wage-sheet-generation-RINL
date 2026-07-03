const API_BASE_URL = window.location.protocol === 'file:'
  || (['localhost', '127.0.0.1', ''].includes(window.location.hostname) && window.location.port !== '3000')
  ? 'http://localhost:5000'
  : window.location.origin;

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || `Request failed: ${response.status}`);
  }
  return data || {};
}
