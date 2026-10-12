import { describe, expect, it } from 'vitest';
import { regionView, wrapMapX } from '../src/client/region-view.js';

describe('continent map framing', () => {
  it('keeps Oceanian islands on the same visible side of the Pacific as Australia', () => {
    const view = regionView('oceania')!;
    const center = view.center[0] + 180;
    const zoom = Math.min(360 / (view.span[0] * 1.08), 180 / (view.span[1] * 1.08));
    for (const longitude of [113, 151, 174, 178, -172, -157]) {
      const x = wrapMapX(longitude + 180, 360, center);
      expect(Math.abs(x - center)).toBeLessThan(360 / zoom / 2);
    }
    expect(wrapMapX(-172 + 180, 360, center)).toBeGreaterThan(360);
  });
  it('resolves country hits consistently across either wrapped map edge', () => {
    expect(wrapMapX(5 + 360, 360)).toBe(5);
    expect(wrapMapX(355 - 360, 360)).toBe(355);
    expect(wrapMapX(5 + 3 * 360, 360)).toBe(5);
    expect(wrapMapX(-2500, 1000, 0)).toBe(500);
  });
  it('uses the full-world view for all continents or an unknown filter', () => {
    expect(regionView('all')).toBeUndefined();
    expect(regionView('unknown')).toBeUndefined();
    expect(regionView('constructor')).toBeUndefined();
  });
});
