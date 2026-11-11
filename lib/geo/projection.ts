/**
 * Mercator projection cropped to the North Atlantic corridor the demo lanes use
 * (US East Coast to Benelux/Germany). Shared by the dot-map generator and the
 * journey builder so dots and routes line up exactly.
 */

export const MAP_BOUNDS = { lonMin: -84, lonMax: 22, latMin: 34, latMax: 60 } as const;
export const MAP_WIDTH = 1000;

const rad = (d: number) => (d * Math.PI) / 180;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));

const yTop = merc(MAP_BOUNDS.latMax);
const yBottom = merc(MAP_BOUNDS.latMin);
const lonSpan = rad(MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin);

export const MAP_HEIGHT = Math.round((MAP_WIDTH * (yTop - yBottom)) / lonSpan);

export function project(lat: number, lon: number): [number, number] {
  const x = ((lon - MAP_BOUNDS.lonMin) / (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin)) * MAP_WIDTH;
  const y = ((yTop - merc(lat)) / (yTop - yBottom)) * MAP_HEIGHT;
  return [x, y];
}

export function unproject(x: number, y: number): [number, number] {
  const lon = MAP_BOUNDS.lonMin + (x / MAP_WIDTH) * (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin);
  const m = yTop - (y / MAP_HEIGHT) * (yTop - yBottom);
  const lat = (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * (180 / Math.PI);
  return [lat, lon];
}

/** Points along the great circle between two coordinates (for flight arcs). */
export function greatCircle(a: [number, number], b: [number, number], steps = 48): [number, number][] {
  const [φ1, λ1] = [rad(a[0]), rad(a[1])];
  const [φ2, λ2] = [rad(b[0]), rad(b[1])];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d === 0) return [a, b];
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push([(Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI, (Math.atan2(y, x) * 180) / Math.PI]);
  }
  return out;
}
