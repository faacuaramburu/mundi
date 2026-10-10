import { readFileSync } from 'node:fs';
import type { Atlas } from '../shared/countries.js';
import type { Geography } from './rooms.js';
import { proximityBand } from './rooms.js';

// Fixed repository paths; only the server reads the distance matrix.
export function loadGeography(): Geography {
  const atlas = JSON.parse(readFileSync(new URL('../../data/atlas.json', import.meta.url), 'utf8')) as Atlas;
  const data = JSON.parse(readFileSync(new URL('../../data/distances.json', import.meta.url), 'utf8')) as { ids: string[]; matrix: number[][] };
  const indices = new Map(data.ids.map((id, index) => [id, index]));
  const countries = new Map(atlas.countries.map(country => [country.id, country]));
  if (data.ids.length !== atlas.countries.length || data.ids.some(id => !countries.has(id))) throw new Error('Geography catalog mismatch');
  return { ids: data.ids, hint(countryId, targetId) {
    const distance = data.matrix.at(indices.get(countryId)!)?.at(indices.get(targetId)!);
    if (distance === undefined || !Number.isFinite(distance)) throw new Error('Invalid server geography');
    const correct = countryId === targetId;
    const border = countries.get(countryId)!.neighbors.includes(targetId);
    return { countryId, distance, correct, border, band: proximityBand(distance, correct, border) };
  } };
}
