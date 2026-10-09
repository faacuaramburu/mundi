import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { geoArea, geoOrthographic, geoPath } from 'd3-geo';
import { URL } from 'node:url';
/* global fetch, AbortSignal */

// Repository-owned paths and checked ISO IDs, never user supplied filenames.
/* eslint-disable security/detect-non-literal-fs-filename */
const revision = 'ca96624a56bd078437bca8184e78163e5039ad19';
const source = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/ne_50m_admin_0_countries.geojson`;
const cache = new URL('../work/geography/countries-50m.geojson', import.meta.url);
let bytes;
try { bytes = await readFile(cache); } catch {
  const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Geography source unavailable');
  bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(new URL('../work/geography/', import.meta.url), { recursive: true });
  await writeFile(cache, bytes);
}
if (createHash('sha256').update(bytes).digest('hex') !== '3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb') throw new Error('Geography checksum mismatch');
const sourceData = JSON.parse(bytes.toString('utf8'));
const atlas = JSON.parse(await readFile(new URL('../data/atlas.json', import.meta.url), 'utf8'));
const mapping = new Map(sourceData.features.map(feature => {
  const p = feature.properties;
  return [p.ISO_A3 === '-99' ? p.ADM0_A3 : p.ISO_A3, p.ISO_A2_EH];
}));
await mkdir(new URL('../public/flags/', import.meta.url), { recursive: true });
for (const country of atlas.countries) {
  const code = mapping.get(country.id)?.toLowerCase();
  if (!/^[a-z]{2}$/.test(code) || !/^[A-Z]{3}$/.test(country.id)) throw new Error(`Missing flag mapping: ${country.id}`);
  await copyFile(new URL(`../node_modules/flag-icons/flags/4x3/${code}.svg`, import.meta.url), new URL(`../public/flags/${country.id}.svg`, import.meta.url));
}
await copyFile(new URL('../node_modules/flag-icons/LICENSE', import.meta.url), new URL('../public/flags/LICENSE', import.meta.url));
await writeFile(new URL('../public/flags/SOURCE.md', import.meta.url), 'Country flags: flag-icons 7.5.0, https://github.com/lipis/flag-icons, MIT. ISO mapping: pinned Natural Earth source used by the atlas.\n');
const projection = geoOrthographic().rotate([20, -10]).translate([32, 32]).scale(20).precision(1);
const path = geoPath(projection).digits(1);
// Simplify the existing geographic contours for legibility at favicon sizes.
const features = sourceData.features.map(feature => {
  const simplified = { ...feature, geometry: {
    ...feature.geometry,
    coordinates: feature.geometry.coordinates.map(polygon => feature.geometry.type === 'Polygon'
      ? simplify(polygon) : polygon.map(simplify)),
  } };
  // A thin island can change winding when simplified. Retain its original shape.
  return Math.abs(geoArea(simplified) - geoArea(feature)) > .03 ? feature : simplified;
});
function simplify(ring) {
  if (ring.length < 16) return ring;
  const points = ring.filter((_point, index) => index % 8 === 0);
  if (points.length < 3) return ring;
  return [...points, points[0]];
}
const land = path({type:'FeatureCollection',features});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" color="#25272b"><path d="${land}" fill="currentColor"/><circle cx="32" cy="32" r="20" stroke="currentColor" stroke-width="2.2"/><g class="brand-orbit"><ellipse cx="32" cy="32" rx="30" ry="9" transform="rotate(-18 32 32)" stroke="currentColor" stroke-width="2.2"/></g></svg>\n`;
await writeFile(new URL('../public/mundi.svg', import.meta.url), svg);
console.info(`Prepared ${atlas.countries.length} local flags and the geographic globe/orbit mark`);
