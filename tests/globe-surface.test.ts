import { describe, expect, it } from 'vitest';
import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import atlasData from '../data/atlas.json' with { type: 'json' };
import { atlasBorders, countrySurface, GlobeSurface } from '../src/client/globe-surface.js';
import type { Atlas, Country } from '../src/shared/countries.js';

const atlas: Atlas = {
  ...atlasData,
  countries: atlasData.countries.map<Country>(country => ({ ...country, focus: [country.focus[0]!, country.focus[1]!] })),
};
function direction(longitude: number, latitude: number): Vector3 {
  const lon = longitude * Math.PI / 180, lat = latitude * Math.PI / 180;
  return new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
}
function countryMesh(id: string): Mesh {
  const country = atlas.countries.find(item => item.id === id)!;
  const surface = countrySurface(country.path, atlas.width, atlas.height);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(surface.positions, 3));
  geometry.setIndex(surface.indices);
  return new Mesh(geometry, new MeshBasicMaterial());
}
function intersects(mesh: Mesh, longitude: number, latitude: number): boolean {
  const point = direction(longitude, latitude);
  return new Raycaster(point.clone().multiplyScalar(2), point.clone().negate()).intersectObject(mesh).length > 0;
}

describe('vector globe geography', () => {
  it('keeps enclaves as holes and faces the viewer from outside the globe', () => {
    const southAfrica = countryMesh('ZAF'), lesotho = countryMesh('LSO');
    expect(intersects(southAfrica, 18.5, -33.8)).toBe(true);
    expect(intersects(southAfrica, 28.2, -29.6)).toBe(false);
    expect(intersects(lesotho, 28.2, -29.6)).toBe(true);
    expect(intersects(lesotho, 18.5, -33.8)).toBe(false);
    southAfrica.geometry.dispose(); lesotho.geometry.dispose();
  });

  it('preserves countries on both sides of the date line without joining them across the ocean', () => {
    const russia = countryMesh('RUS');
    expect(intersects(russia, 170, 65)).toBe(true);
    expect(intersects(russia, -175, 66)).toBe(true);
    expect(intersects(russia, -150, 30)).toBe(false);
    russia.geometry.dispose();
  });

  it('does not draw the artificial vertical edge of the flat atlas as a globe border', () => {
    const positions = atlasBorders({ ...atlas, countries: [], context: [{ name: 'Date line', path: 'M0,450L10,450L10,500L0,500Z' }] });
    for (let index = 0; index < positions.length; index += 6) {
      const from = new Vector3().fromArray(positions, index), to = new Vector3().fromArray(positions, index + 3);
      expect(Math.abs(from.z) < 1e-10 && Math.abs(to.z) < 1e-10).toBe(false);
    }
  });

  it('builds the complete world within a modest geometry budget and recolors only the requested country', () => {
    const surface = new GlobeSurface(atlas);
    const position = surface.geometry.getAttribute('position');
    const colors = surface.geometry.getAttribute('color');
    const before = Array.from(colors.array);
    surface.paint('URY', '#419b72');
    const green = new Color('#419b72');
    let changed = 0;
    for (let index = 0; index < position.count; index++) {
      const point = new Vector3().fromBufferAttribute(position, index);
      expect(point.length()).toBeCloseTo(1.001, 6);
      if (colors.getX(index) !== before.at(index * 3)) {
        changed++;
        expect(colors.getX(index)).toBeCloseTo(green.r, 6);
        expect(colors.getY(index)).toBeCloseTo(green.g, 6);
        expect(colors.getZ(index)).toBeCloseTo(green.b, 6);
        const longitude = Math.atan2(-point.z, point.x) * 180 / Math.PI;
        const latitude = Math.asin(point.y / point.length()) * 180 / Math.PI;
        expect(longitude).toBeGreaterThan(-59); expect(longitude).toBeLessThan(-53);
        expect(latitude).toBeGreaterThan(-36); expect(latitude).toBeLessThan(-29);
      }
    }
    expect(changed).toBeGreaterThan(0);
    expect(position.array.byteLength * 3 + surface.geometry.index!.array.byteLength).toBeLessThan(16 * 1024 * 1024);
    surface.geometry.dispose();
  });
});
