/**
 * Generates the dotted land layers from Natural Earth (world-atlas):
 *   lib/geo/land-dots.json   North Atlantic, 1:50m (case journey map)
 *   lib/geo/world-dots.json  World, 1:110m (live shipments map)
 * Run once: npm run gen:map
 */
import fs from "node:fs";
import path from "node:path";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { MAP_HEIGHT, MAP_WIDTH, unproject } from "@/lib/geo/projection";
import { WORLD, WORLD_HEIGHT, unprojectWorld } from "@/lib/geo/world";

function land(file: string) {
  const topo = JSON.parse(fs.readFileSync(path.join("node_modules", "world-atlas", file), "utf8")) as Topology;
  return feature(topo, topo.objects.land);
}

function dots(width: number, height: number, step: number, inv: (x: number, y: number) => [number, number], shape: ReturnType<typeof land>) {
  const out: [number, number][] = [];
  for (let y = step / 2; y < height; y += step) {
    for (let x = step / 2; x < width; x += step) {
      const [lat, lon] = inv(x, y);
      if (geoContains(shape, [lon, lat])) out.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    }
  }
  return out;
}

const atlantic = dots(MAP_WIDTH, MAP_HEIGHT, 7, unproject, land("land-50m.json"));
fs.writeFileSync(
  path.join("lib", "geo", "land-dots.json"),
  JSON.stringify({ source: "Natural Earth 1:50m land via world-atlas", step: 7, width: MAP_WIDTH, height: MAP_HEIGHT, dots: atlantic }),
);
console.log(`${atlantic.length} dots → lib/geo/land-dots.json (${MAP_WIDTH}×${MAP_HEIGHT})`);

const world = dots(WORLD.width, WORLD_HEIGHT, 5, unprojectWorld, land("land-110m.json"));
fs.writeFileSync(
  path.join("lib", "geo", "world-dots.json"),
  JSON.stringify({ source: "Natural Earth 1:110m land via world-atlas", step: 5, width: WORLD.width, height: WORLD_HEIGHT, dots: world }),
);
console.log(`${world.length} dots → lib/geo/world-dots.json (${WORLD.width}×${WORLD_HEIGHT})`);
