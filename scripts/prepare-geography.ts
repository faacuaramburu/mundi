import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { geoCentroid, geoEquirectangular, geoPath } from 'd3-geo';
import type { FeatureCollection, MultiPolygon, Polygon as GeoPolygon } from 'geojson';
import { boundaryDistance, makeTree, sampleBoundaries } from './geography.js';
import type { Point, Polygon } from './geography.js';

const revision = 'ca96624a56bd078437bca8184e78163e5039ad19';
const source = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/ne_50m_admin_0_countries.geojson`;
const checksum = '3e458fc036ad0a66411f2c1e6cac49c5d7bfb81cb1123bc513b22511a2b7fdeb';
const cache = new URL('../work/geography/countries-50m.geojson', import.meta.url);
const roster = new Set(`AFG ALB DZA AND AGO ATG ARG ARM AUS AUT AZE BHS BHR BGD BRB BLR BEL BLZ BEN BTN BOL BIH BWA BRA BRN BGR BFA BDI CPV KHM CMR CAN CAF TCD CHL CHN COL COM COG COD CRI CIV HRV CUB CYP CZE DNK DJI DMA DOM ECU EGY SLV GNQ ERI EST SWZ ETH FJI FIN FRA GAB GMB GEO DEU GHA GRC GRD GTM GIN GNB GUY HTI HND HUN ISL IND IDN IRN IRQ IRL ISR ITA JAM JPN JOR KAZ KEN KIR PRK KOR KWT KGZ LAO LVA LBN LSO LBR LBY LIE LTU LUX MDG MWI MYS MDV MLI MLT MHL MRT MUS MEX FSM MDA MCO MNG MNE MAR MOZ MMR NAM NRU NPL NLD NZL NIC NER NGA MKD NOR OMN PAK PLW PAN PNG PRY PER PHL POL PRT QAT ROU RUS RWA KNA LCA VCT WSM SMR STP SAU SEN SRB SYC SLE SGP SVK SVN SLB SOM ZAF SSD ESP LKA SDN SUR SWE CHE SYR TJK TZA THA TLS TGO TON TTO TUN TUR TKM TUV UGA UKR ARE GBR USA URY UZB VUT VEN VNM YEM ZMB ZWE PSE VAT`.split(' '));

let raw: Buffer;
try {
  raw = await readFile(cache);
} catch {
  const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Geography download failed');
  raw = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(raw).digest('hex') !== checksum) throw new Error('Geography checksum mismatch');
  await mkdir(new URL('../work/geography/', import.meta.url), { recursive: true });
  await writeFile(cache, raw);
}
if (createHash('sha256').update(raw).digest('hex') !== checksum) throw new Error('Geography checksum mismatch');

type Properties = { ISO_A3: string; ADM0_A3: string; NAME_EN: string; NAME_ES: string; ADMIN: string };
const collection = JSON.parse(raw.toString('utf8')) as FeatureCollection<GeoPolygon | MultiPolygon, Properties>;

const projection = geoEquirectangular().scale(2048 / (2 * Math.PI)).translate([1024, 512]).precision(0.2);
const path = geoPath(projection).digits(2);
const countries: { id: string; name: string; nameEs: string; focus: Point; path: string; neighbors: string[] }[] = [];
const context: { name: string; path: string }[] = [];
const geometry = new Map<string, Polygon[]>();

function included(id: string, polygon: Polygon): boolean {
  const ring = polygon[0]!;
  if (id === 'FRA') return ring.every(([lon, lat]) => lon >= -10 && lon <= 12 && lat >= 40 && lat <= 55);
  if (id === 'NLD') return ring.every(([, lat]) => lat >= 45);
  if (id === 'NOR') return ring.every(([lon, lat]) => lon >= 0 && lat <= 73);
  if (id === 'AUS') return ring.every(([, lat]) => lat >= -50);
  if (id === 'NZL') return ring.every(([, lat]) => lat >= -48 && lat <= -25);
  return true;
}

for (const feature of collection.features) {
  const props = feature.properties;
  const id = props.ISO_A3 === '-99' ? props.ADM0_A3 : props.ISO_A3;
  const polygons = (feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates) as Polygon[];
  if (!roster.has(id)) {
    context.push({ name: props.NAME_EN, path: path(feature) ?? '' });
    continue;
  }
  const main = polygons.filter((polygon) => included(id, polygon));
  const excluded = polygons.filter((polygon) => !included(id, polygon));
  if (main.length === 0 || geometry.has(id)) throw new Error(`Invalid catalog entry: ${id}`);
  const shape: MultiPolygon = { type: 'MultiPolygon', coordinates: main };
  const center = geoCentroid(shape) as Point;
  countries.push({ id, name: props.NAME_EN, nameEs: props.NAME_ES, focus: center, path: path(shape) ?? '', neighbors: [] });
  geometry.set(id, main);
  if (excluded.length) {
    context.push({ name: `${props.NAME_EN} overseas territory`, path: path({ type: 'MultiPolygon', coordinates: excluded }) ?? '' });
  }
}
countries.sort((a, b) => a.id.localeCompare(b.id));
if (countries.length !== 195 || roster.size !== 195) {
  const missing = [...roster].filter((id) => !geometry.has(id));
  throw new Error(`Expected 195 countries, got ${countries.length}; missing: ${missing.join(', ')}`);
}

// Shared source segments establish land adjacency without treating point contact as a border.
const owners = new Map<string, string>();
const neighbors = new Map(countries.map((country) => [country.id, new Set<string>()]));
for (const [id, polygons] of geometry) {
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const first = ring[i]!.join(',');
        const second = ring[i + 1]!.join(',');
        if (first === second) continue;
        const key = first < second ? `${first}/${second}` : `${second}/${first}`;
        const owner = owners.get(key);
        if (owner && owner !== id) {
          neighbors.get(id)!.add(owner);
          neighbors.get(owner)!.add(id);
        } else {
          owners.set(key, id);
        }
      }
    }
  }
}
const reviewedBorders = [
  ['ARG', 'URY'], ['ARG', 'BRA'], ['BRA', 'URY'],
  ['VAT', 'ITA'], ['SMR', 'ITA'], ['MCO', 'FRA'],
  ['AND', 'FRA'], ['AND', 'ESP'], ['LIE', 'AUT'], ['LIE', 'CHE'],
  ['PSE', 'ISR'], ['PSE', 'JOR'], ['PSE', 'EGY'],
] as const;
for (const [a, b] of reviewedBorders) {
  neighbors.get(a)!.add(b);
  neighbors.get(b)!.add(a);
}

console.info(`Preparing boundary samples for ${countries.length} countries`);
const samples = countries.map((country) => sampleBoundaries(geometry.get(country.id)!));
const trees = samples.map((points) => makeTree(points)!);
const matrix = countries.map(() => Array<number>(countries.length).fill(0));
for (let i = 0; i < countries.length; i++) {
  const country = countries[i]!;
  country.neighbors = [...neighbors.get(country.id)!].sort();
  for (let j = i + 1; j < countries.length; j++) {
    const adjacent = neighbors.get(country.id)!.has(countries[j]!.id);
    const shorter = samples[i]!.length <= samples[j]!.length;
    const distance = adjacent ? 0 : boundaryDistance(shorter ? samples[i]! : samples[j]!, shorter ? trees[j]! : trees[i]!);
    matrix[i]![j] = Math.round(distance * 100) / 100;
    matrix[j]![i] = matrix[i]![j]!;
  }
  if (i % 25 === 0) console.info(`Prepared ${i + 1}/${countries.length}`);
}

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(new URL('../data/atlas.json', import.meta.url), JSON.stringify({
  version: 1, width: 2048, height: 1024,
  source: { url: source, sha256: checksum, revision, sampleSpacingKm: 10 },
  countries, context,
}));
await writeFile(new URL('../data/distances.json', import.meta.url), JSON.stringify({
  version: 1, ids: countries.map((country) => country.id), matrix,
}));
console.info('Prepared atlas and symmetric distance matrix');
