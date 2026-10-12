import { describe, expect, it } from 'vitest';
import atlas from '../data/atlas.json' with { type: 'json' };
import { countryRegion, filterIndexCountries, regionCountries } from '../src/shared/regions.js';
import type { Country } from '../src/shared/countries.js';

const countries = atlas.countries.map<Country>(country => ({ ...country, focus: [country.focus[0]!, country.focus[1]!] }));
describe('country index regions', () => {
  it('classifies every accepted country once, without adding excluded territories', () => {
    const ids = Object.values(regionCountries).flat();
    expect(ids).toHaveLength(195);
    expect(new Set(ids).size).toBe(195);
    expect([...ids].sort()).toEqual(countries.map(country => country.id).sort());
    expect(Object.fromEntries(Object.entries(regionCountries).map(([key, value]) => [key, value.length])))
      .toEqual({ africa: 54, asia: 48, europe: 44, northAmerica: 23, southAmerica: 12, oceania: 14 });
    for (const id of ['PRI', 'GRL', 'ESH', 'TWN', 'XKX']) expect(countryRegion(id)).toBeUndefined();
  });
  it('uses UN regional assignments for transcontinental countries and Central America', () => {
    for (const id of ['TUR', 'CYP', 'GEO', 'ARM', 'AZE', 'KAZ', 'PSE']) expect(countryRegion(id)).toBe('asia');
    for (const id of ['RUS', 'FRA', 'VAT']) expect(countryRegion(id)).toBe('europe');
    expect(countryRegion('EGY')).toBe('africa');
    for (const id of ['PAN', 'MEX', 'CUB', 'TTO']) expect(countryRegion(id)).toBe('northAmerica');
  });
  it('combines continent, discovery status and bilingual, accent-insensitive search without changing progress', () => {
    const found = new Set(['ARG', 'FRA', 'USA']);
    expect(filterIndexCountries(countries, found, { region: 'southAmerica', status: 'found' }).map(c => c.id)).toEqual(['ARG']);
    expect(filterIndexCountries(countries, found, { region: 'southAmerica', status: 'missing' })).toHaveLength(11);
    expect(filterIndexCountries(countries, found, { region: 'southAmerica', query: '  BRÁSIL  ' }).map(c => c.id)).toEqual(['BRA']);
    expect(filterIndexCountries(countries, found, { region: 'europe', query: 'Germany' }).map(c => c.id)).toEqual(['DEU']);
    expect(filterIndexCountries(countries, found, { region: 'europe', query: 'Alemania' }).map(c => c.id)).toEqual(['DEU']);
    expect(filterIndexCountries(countries, found, { region: 'asia', status: 'found' })).toEqual([]);
    expect(filterIndexCountries(countries, found, {})).toHaveLength(195);
    expect([...found]).toEqual(['ARG', 'FRA', 'USA']);
  });
});
