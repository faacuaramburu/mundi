export type Point = [number, number];
export type Vector = [number, number, number];
export type Polygon = Point[][];

const radius = 6371;

export function toVector([longitude, latitude]: Point): Vector {
  const lon = longitude * Math.PI / 180;
  const lat = latitude * Math.PI / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

export function sphericalDistance(a: Point, b: Point): number {
  const u = toVector(a);
  const v = toVector(b);
  return chordToKm(Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]));
}

function chordToKm(chord: number): number {
  return 2 * radius * Math.asin(Math.min(1, chord / 2));
}

export function sampleBoundaries(polygons: Polygon[], spacingKm = 10): Vector[] {
  if (!Number.isFinite(spacingKm) || spacingKm <= 0) throw new Error('Invalid sample spacing');
  const samples: Vector[] = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = toVector(ring[i]!);
        const b = toVector(ring[i + 1]!);
        const angle = 2 * Math.asin(Math.min(1, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 2));
        const steps = Math.max(1, Math.ceil(angle * radius / spacingKm));
        for (let j = 0; j < steps; j++) {
          const t = j / steps;
          const denominator = Math.sin(angle);
          const left = angle < 1e-12 ? 1 - t : Math.sin((1 - t) * angle) / denominator;
          const right = angle < 1e-12 ? t : Math.sin(t * angle) / denominator;
          samples.push([
            left * a[0] + right * b[0],
            left * a[1] + right * b[1],
            left * a[2] + right * b[2],
          ]);
        }
      }
    }
  }
  if (samples.length === 0) throw new Error('Empty country geometry');
  return samples;
}

export interface Tree {
  point: Vector;
  axis: 0 | 1 | 2;
  left: Tree | null;
  right: Tree | null;
}

export function makeTree(points: Vector[], depth = 0): Tree | null {
  if (points.length === 0) return null;
  const axis = depth % 3 as 0 | 1 | 2;
  const sorted = [...points].sort((a, b) => a[axis] - b[axis]);
  const middle = Math.floor(sorted.length / 2);
  return {
    point: sorted[middle]!, axis,
    left: makeTree(sorted.slice(0, middle), depth + 1),
    right: makeTree(sorted.slice(middle + 1), depth + 1),
  };
}

function nearestSquared(point: Vector, tree: Tree | null, best: number): number {
  if (!tree) return best;
  const dx = point[0] - tree.point[0];
  const dy = point[1] - tree.point[1];
  const dz = point[2] - tree.point[2];
  best = Math.min(best, dx * dx + dy * dy + dz * dz);
  const delta = point[tree.axis] - tree.point[tree.axis];
  best = nearestSquared(point, delta < 0 ? tree.left : tree.right, best);
  if (delta * delta < best) {
    best = nearestSquared(point, delta < 0 ? tree.right : tree.left, best);
  }
  return best;
}

export function boundaryDistance(samples: Vector[], tree: Tree): number {
  if (samples.length === 0) throw new Error('Empty boundary samples');
  let best = Infinity;
  for (const point of samples) best = nearestSquared(point, tree, best);
  return chordToKm(Math.sqrt(best));
}
