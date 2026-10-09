export function prefersReducedMotion(): boolean {
  const preference = document.documentElement.dataset.motion;
  return preference ? preference === 'reduced' : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function initializeMotion(): void {
  const system = window.matchMedia('(prefers-reduced-motion: reduce)');
  let saved: string | null = null;
  try { saved = localStorage.getItem('mundi-motion'); } catch { /* Preferences can be temporary. */ }
  const render = () => {
    const reduced = saved === 'reduced' || (saved !== 'full' && system.matches);
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
  };
  const storage = (event: StorageEvent) => {
    if (event.key !== 'mundi-motion' && event.key !== null) return;
    saved = event.newValue;
    render();
  };
  render();
  system.addEventListener('change', render);
  window.addEventListener('storage', storage);
  if (import.meta.hot) import.meta.hot.dispose(() => {
    system.removeEventListener('change', render);
    window.removeEventListener('storage', storage);
  });
}
