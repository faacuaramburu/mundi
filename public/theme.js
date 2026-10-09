try {
  globalThis.document.documentElement.dataset.theme = globalThis.localStorage.getItem('mundi-theme') === 'light' ? 'light' : 'dark';
} catch {
  globalThis.document.documentElement.dataset.theme = 'dark';
}
