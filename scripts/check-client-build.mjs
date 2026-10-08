import { readFile, readdir } from 'node:fs/promises';
import { URL } from 'node:url';

const assets = new URL('../dist/client/assets/', import.meta.url);
const names = await readdir(assets);
const distances = JSON.parse(await readFile(new URL('../data/distances.json', import.meta.url), 'utf8'));
const signature = distances.matrix[0].join(',');
for (const name of names) {
  if (!/^[\w.-]+\.(js|json)$/.test(name)) continue;
  // Names come only from this build's directory and must be plain filenames.
  const content = await readFile(new URL(name, assets), 'utf8');
  if (content.includes('Distance unavailable') || content.replace(/\s/g, '').includes(signature)) {
    throw new Error('Development practice or private distances leaked into the client build');
  }
}
console.info('Production client excludes local practice and the distance matrix');
