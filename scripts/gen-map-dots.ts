/**
 * Generates lib/geo/land-dots.json: a dot grid over land for the journey map,
 * from Natural Earth 1:50m land (world-atlas). Run once: npm run gen:map
 */
import fs from "node:fs";
import path from "node:path";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { MAP_HEIGHT, MAP_WIDTH, unproject } from "@/lib/geo/projection";

const STEP = 7;
const topo = JSON.parse(fs.readFileSync(path.join("node_modules", "world-atlas", "land-50m.json"), "utf8")) as Topology;
const land = feature(topo, topo.objects.land);

const dots: [number, number][] = [];
for (let y = STEP / 2; y < MAP_HEIGHT; y += STEP) {
  for (let x = STEP / 2; x < MAP_WIDTH; x += STEP) {
    const [lat, lon] = unproject(x, y);
    if (geoContains(land, [lon, lat])) dots.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }
}
const out = path.join("lib", "geo", "land-dots.json");
fs.writeFileSync(out, JSON.stringify({ source: "Natural Earth 1:50m land via world-atlas", step: STEP, width: MAP_WIDTH, height: MAP_HEIGHT, dots }));
console.log(`${dots.length} dots → ${out} (${MAP_WIDTH}×${MAP_HEIGHT})`);
