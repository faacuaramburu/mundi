import type { Region } from '../shared/regions.js';

// Frame the geographic continent, rather than distant overseas territories.
export const regionViews: Record<Region, { center: [number, number]; span: [number, number]; radius: number }> = {
  africa: { center: [18, 0], span: [88, 88], radius: 48 },
  asia: { center: [90, 28], span: [146, 104], radius: 68 },
  europe: { center: [16, 55], span: [88, 48], radius: 34 },
  northAmerica: { center: [-100, 40], span: [146, 92], radius: 63 },
  southAmerica: { center: [-60, -24], span: [76, 84], radius: 46 },
  oceania: { center: [165, -18], span: [122, 80], radius: 58 },
};

export function regionView(region: string) {
  return Object.hasOwn(regionViews, region) ? regionViews[region as Region] : undefined;
}

/** Return the copy of a map coordinate nearest the visible world's center. */
export function wrapMapX(x: number, width: number, center = width / 2): number {
  return x + Math.round((center - x) / width) * width;
}
