import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { GlobeFlight } from '../src/client/globe-flight.js';

describe('country focus flight', () => {
  it('travels around the surface even between opposite sides, retaining deep zoom', () => {
    const position = new Vector3(1.25, 0, 0);
    const target = new Vector3();
    const flight = new GlobeFlight(position, new Vector3(-1, 0, 0), target, 0, false);
    for (let time = 0; time <= flight.duration; time += 10) {
      flight.update(position, target, time);
      expect(position.length()).toBeCloseTo(1.25, 12);
      expect(Number.isFinite(position.x + position.y + position.z)).toBe(true);
    }
    flight.update(position, target, flight.duration / 2);
    expect(Math.abs(position.x)).toBeLessThan(.000001);
    expect(flight.update(position, target, flight.duration)).toBe(true);
    expect(position.distanceTo(new Vector3(-1.25, 0, 0))).toBeLessThan(.000001);
  });

  it('reaches the same orientation at the same elapsed time for different frame rates', () => {
    const start = new Vector3(2, 1, 2);
    const end = new Vector3(-1, .3, -1);
    const at60 = start.clone(); const at120 = start.clone();
    const first = new GlobeFlight(start, end, new Vector3(), 0, false);
    const second = new GlobeFlight(start, end, new Vector3(), 0, false);
    for (let time = 0; time < 400; time += 1000 / 60) first.update(at60, new Vector3(), time);
    for (let time = 0; time < 400; time += 1000 / 120) second.update(at120, new Vector3(), time);
    first.update(at60, new Vector3(), 400); second.update(at120, new Vector3(), 400);
    expect(at60.distanceTo(at120)).toBeLessThan(.000001);
  });

  it('a replacement flight starts from the current view and recenters a cursor-zoom target gradually', () => {
    const position = new Vector3(0, 0, 3);
    const target = new Vector3(.2, .1, 0);
    const first = new GlobeFlight(position, new Vector3(1, 0, 0), target, 100, false);
    first.update(position, target, 300);
    const current = position.clone(); const currentTarget = target.clone();
    const next = new GlobeFlight(position, new Vector3(-1, 0, 0), target, 300, false);
    next.update(position, target, 300);
    expect(position.distanceTo(current)).toBeLessThan(.000001);
    expect(target.distanceTo(currentTarget)).toBeLessThan(.000001);
    next.update(position, target, 300 + next.duration / 2);
    expect(target.length()).toBeCloseTo(currentTarget.length() / 2, 10);
    next.update(position, target, 300 + next.duration + 1000);
    expect(target.length()).toBe(0);
    expect(position.length()).toBeCloseTo(3, 10);
  });

  it('reduced motion keeps a short, finite transition instead of teleporting', () => {
    const position = new Vector3(3, 0, 0);
    const target = new Vector3();
    const end = new Vector3(0, 0, -1);
    const short = new GlobeFlight(position, end, target, 500, true);
    const normal = new GlobeFlight(position, end, target, 500, false);
    expect(short.duration).toBeLessThan(normal.duration);
    expect(short.update(position, target, 500 + short.duration / 2)).toBe(false);
    expect(position.x).toBeGreaterThan(0);
    expect(position.z).toBeLessThan(0);
    expect(short.update(position, target, 500 + short.duration)).toBe(true);
    expect(position.distanceTo(new Vector3(0, 0, -3))).toBeLessThan(.000001);
  });
});
