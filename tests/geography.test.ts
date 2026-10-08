import { describe, expect, it } from 'vitest';
import atlas from '../data/atlas.json' with { type: 'json' };
import distances from '../data/distances.json' with { type: 'json' };
import { boundaryDistance, makeTree, sampleBoundaries, sphericalDistance } from '../scripts/geography.js';
import { findCountries, formatDistance, getHint, normalizeName } from '../src/shared/countries.js';
import type { Country } from '../src/shared/countries.js';

const countries = atlas.countries.map<Country>((country) => ({
  ...country, focus: [country.focus[0]!, country.focus[1]!],
}));
const byId = new Map(countries.map((country) => [country.id, country]));
const index = new Map(distances.ids.map((id, position) => [id, position]));
function distance(a: string, b: string): number {
  return distances.matrix[index.get(a)!]![index.get(b)!]!;
}

describe('geographic data and proximity', () => {
  it('contains exactly the agreed roster and a valid symmetric matrix', () => {
    expect(countries).toHaveLength(195);
    expect(new Set(distances.ids).size).toBe(195);
    expect(distances.ids).toEqual(countries.map((country) => country.id));
    for (let i = 0; i < 195; i++) {
      expect(countries[i]!.path.length).toBeGreaterThan(0);
      expect(distances.matrix[i]).toHaveLength(195);
      expect(distances.matrix[i]![i]).toBe(0);
      for (let j = 0; j < 195; j++) {
        const value = distances.matrix[i]![j]!;
        expect(Number.isFinite(value) && value >= 0 && value <= 20016).toBe(true);
        expect(value).toBe(distances.matrix[j]![i]);
      }
    }
  });

  it('recognizes Argentina–Uruguay and keeps border guesses distinct from correct guesses', () => {
    expect(byId.get('URY')!.neighbors).toContain('ARG');
    expect(byId.get('ARG')!.neighbors).toContain('URY');
    expect(distance('ARG', 'URY')).toBe(0);
    expect(getHint(0, false, true)).toMatchObject({ label: 'Shares a border', correct: false, border: true });
    expect(getHint(0, true, false)).toMatchObject({ label: 'Correct country', correct: true });
  });

  it('excludes French Guiana from France gameplay and preserves tiny-state borders', () => {
    expect(byId.get('FRA')!.neighbors).not.toContain('BRA');
    expect(byId.get('BRA')!.neighbors).not.toContain('FRA');
    expect(distance('FRA', 'BRA')).toBeGreaterThan(5000);
    expect(byId.get('FRA')!.neighbors).toContain('ESP');
    expect(byId.get('VAT')!.neighbors).toContain('ITA');
    expect(distance('VAT', 'ITA')).toBe(0);
  });

  it('uses great-circle distance across the antimeridian and boundary samples rather than centroids', () => {
    expect(sphericalDistance([179, 0], [-179, 0])).toBeCloseTo(222.39, 1);
    expect(sphericalDistance([0, 89], [180, 89])).toBeCloseTo(222.39, 1);
    const left = sampleBoundaries([[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]]);
    const right = sampleBoundaries([[[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]]]);
    const tree = makeTree(right)!;
    expect(boundaryDistance(left, tree)).toBeGreaterThan(110);
    expect(boundaryDistance(left, tree)).toBeLessThan(112);
    expect(() => sampleBoundaries([])).toThrow('Empty');
  });

  it.each([
    [499.99, 'Very hot'], [500, 'Hot'], [1500, 'Warm'], [3000, 'Cool'], [6000, 'Cold'],
  ])('uses unambiguous bands at %s km', (value, label) => {
    expect(getHint(value, false, false).label).toBe(label);
  });

  it('normalizes English/Spanish names and presents both Congos', () => {
    expect(normalizeName('  MÉXICO  ')).toBe('mexico');
    expect(findCountries(countries, 'estados unidos')[0]!.id).toBe('USA');
    expect(findCountries(countries, 'Congo').map((country) => country.id)).toEqual(expect.arrayContaining(['COD', 'COG']));
    expect(findCountries(countries, 'argntina')[0]!.id).toBe('ARG');
    expect(findCountries(countries, '')).toEqual([]);
  });

  it('formats approximate kilometers and exact zero for borders or correct guesses', () => {
    expect(formatDistance(6528.42)).toBe('≈ 6,528 km');
    expect(formatDistance(0)).toBe('0 km');
    expect(() => formatDistance(-1)).toThrow('Invalid distance');
  });
});
