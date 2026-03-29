(function initBackendOriginBridge(){
  if (typeof window === 'undefined') return;
  const configOrigin = (window.ALFE_BACKEND_ORIGIN || '').trim();
  const localMeta = document.querySelector('meta[name="alfe-backend-origin"]');
  const metaOrigin = localMeta && localMeta.content ? String(localMeta.content).trim() : '';
  const origin = configOrigin || metaOrigin;
  if (!origin) return;

  const normalizeUrl = (value) => {
    if (!value || typeof value !== 'string') return value;
    if (/^(https?:|data:|blob:|mailto:|tel:)/i.test(value)) return value;
    if (!value.startsWith('/')) return value;
    return `${origin}${value}`;
  };

  window.alfeBackendUrl = normalizeUrl;

  if (typeof window.fetch === 'function') {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function patchedFetch(input, init) {
      if (typeof input === 'string') {
        return nativeFetch(normalizeUrl(input), Object.assign({ credentials: 'include' }, init || {}));
      }
      if (input instanceof Request) {
        const patched = new Request(normalizeUrl(input.url), input);
        const merged = Object.assign({ credentials: 'include' }, init || {});
        return nativeFetch(patched, merged);
      }
      return nativeFetch(input, Object.assign({ credentials: 'include' }, init || {}));
    };
  }

  if (typeof window.EventSource === 'function') {
    const NativeEventSource = window.EventSource;
    window.EventSource = function PatchedEventSource(url, config) {
      const nextConfig = Object.assign({}, config || {});
      nextConfig.withCredentials = true;
      return new NativeEventSource(normalizeUrl(url), nextConfig);
    };
    window.EventSource.prototype = NativeEventSource.prototype;
  }
})();
