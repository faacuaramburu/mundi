import { prefersReducedMotion } from './motion.js';

const arrival = 'cubic-bezier(0.16, 1, 0.3, 1)';

function play(node: HTMLElement, frames: Keyframe[], duration: number): void {
  for (const animation of node.getAnimations()) animation.cancel();
  node.animate(frames, { duration, easing: arrival });
}

/** A new clue settles into the history; restored clues stay still. */
export function animateGuess(entry: HTMLElement): void {
  const reduced = prefersReducedMotion();
  play(entry, reduced ? [{ opacity: .7 }, { opacity: 1 }]
    : [{ opacity: .7, transform: 'translateX(6px)' }, { opacity: 1, transform: 'translateX(0)' }], reduced ? 100 : 220);
  const swatch = entry.querySelector<HTMLElement>('.guess-swatch');
  if (swatch && !reduced) play(swatch, [{ transform: 'scale(.4)' }, { transform: 'scale(1)' }], 260);
}

/** Reveal the outcome once; the winning flag gets a small finishing gesture. */
export function animateRoundResult(node: HTMLElement, won: boolean): void {
  const reduced = prefersReducedMotion();
  play(node, [{ opacity: .6 }, { opacity: 1 }], reduced ? 100 : 240);
  const flag = node.querySelector<HTMLElement>('.country-flag');
  if (won && flag && !reduced) play(flag, [
    { transform: 'rotate(-8deg) scale(.85)' },
    { transform: 'rotate(0) scale(1)' },
  ], 380);
}
