/** D_AI GPL-3.0-or-later: Electron main-process read-only bridge client. */
export function createDaiDesktopClient({ baseUrl, token, fetchImpl = globalThis.fetch }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('Bridge token must be 32+ characters');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch must be available');
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Bridge URL must be an explicit 127.0.0.1 HTTP origin with a port');
  }
  const request = async (endpoint) => {
    const response = await fetchImpl(new URL(endpoint, url), {
      method: 'GET',
      headers: { 'X-DAI-Bridge-Token': token, 'Accept': 'application/json' },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error('D_AI desktop bridge returned ' + response.status);
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid bridge response');
    return data;
  };
  return Object.freeze({
    health: () => request('/v1/health'),
    systems: () => request('/v1/systems'),
    capabilities: () => request('/v1/capabilities'),
  });
}
