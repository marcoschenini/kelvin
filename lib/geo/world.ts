/**
 * Equirectangular world projection for the live map (Antarctica and the far
 * Arctic cropped). Shared by the dot generator and the fleet simulation.
 */
export const WORLD = { lonMin: -170, lonMax: 190, latMin: -56, latMax: 76, width: 1000 } as const;
export const WORLD_HEIGHT = Math.round((WORLD.width * (WORLD.latMax - WORLD.latMin)) / (WORLD.lonMax - WORLD.lonMin));

/** Longitudes are shifted so the Pacific seam falls east of Japan/Australia. */
function normLon(lon: number) {
  let l = lon;
  while (l < WORLD.lonMin) l += 360;
  while (l > WORLD.lonMax) l -= 360;
  return l;
}

export function projectWorld(lat: number, lon: number): [number, number] {
  const x = ((normLon(lon) - WORLD.lonMin) / (WORLD.lonMax - WORLD.lonMin)) * WORLD.width;
  const y = ((WORLD.latMax - lat) / (WORLD.latMax - WORLD.latMin)) * WORLD_HEIGHT;
  return [x, y];
}

export function unprojectWorld(x: number, y: number): [number, number] {
  const lon = WORLD.lonMin + (x / WORLD.width) * (WORLD.lonMax - WORLD.lonMin);
  const lat = WORLD.latMax - (y / WORLD_HEIGHT) * (WORLD.latMax - WORLD.latMin);
  return [lat, lon > 180 ? lon - 360 : lon];
}

/** Map regions for the zoom presets: [x, y, width, height] in map units. */
export const REGIONS = {
  world: { label: "World", box: [0, 0, WORLD.width, WORLD_HEIGHT] },
  europe: { label: "Europe", box: [400, 32, 200, 74] },
  americas: { label: "North America", box: [110, 60, 200, 110] },
  asia: { label: "Asia-Pacific", box: [630, 90, 330, 230] },
} as const satisfies Record<string, { label: string; box: [number, number, number, number] }>;
export type RegionId = keyof typeof REGIONS;
