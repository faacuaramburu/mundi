import { prefersReducedMotion } from './motion.js';

/** One orbit per interaction; reduced motion keeps a gentle, short tilt. */
export function turnBrandOrbit(): void {
  const orbit = document.querySelector<SVGGElement>('.brand-orbit');
  if (!orbit) return;
  const reduced = prefersReducedMotion();
  for (const animation of orbit.getAnimations()) animation.cancel();
  orbit.animate(reduced ? [
    { transform: 'rotate(0deg)' },
    { transform: 'rotate(18deg)', offset: .5 },
    { transform: 'rotate(0deg)' },
  ] : [
    { transform: 'rotate(0deg)' },
    { transform: 'rotate(360deg)' },
  ], { duration: reduced ? 700 : 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
}
