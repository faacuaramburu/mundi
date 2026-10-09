/** A single, interruptible orbit gesture acknowledges a valid guess. */
export function turnBrandOrbit(): void {
  const orbit = document.querySelector<SVGGElement>('.brand-orbit');
  if (!orbit || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const animation of orbit.getAnimations()) animation.cancel();
  orbit.animate([
    { transform: 'rotate(0deg)' },
    { transform: 'rotate(25deg)', offset: .45 },
    { transform: 'rotate(0deg)' },
  ], { duration: 650, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
}
