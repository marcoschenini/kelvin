/**
 * Generates lib/geo/world-land.json: Natural Earth 1:110m land (world-atlas) as one SVG path
 * in the live-map projection (lib/geo/world.ts). Run: npx tsx scripts/gen-map-land.ts
 */
import fs from "node:fs";
import path from "node:path";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { WORLD, WORLD_HEIGHT, projectWorld } from "@/lib/geo/world";

const topo = JSON.parse(fs.readFileSync(path.join("node_modules", "world-atlas", "land-110m.json"), "utf8")) as Topology;
const land = feature(topo, topo.objects.land) as unknown as { features: { geometry: { type: string; coordinates: number[][][][] | number[][][] } }[] };

let d = "";
let rings = 0;
let split = 0;
for (const f of land.features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
  for (const poly of polys)
    for (const ring of poly) {
      const pts = ring.map(([lon, lat]) => projectWorld(lat, lon));
      // A ring that crosses the map seam would draw a band across the map: cut it there.
      let seg = "";
      pts.forEach(([x, y], i) => {
        const jump = i > 0 && Math.abs(x - pts[i - 1][0]) > 400;
        if (jump) split++;
        seg += `${i === 0 || jump ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      });
      d += seg + "Z";
      rings++;
    }
}
fs.writeFileSync("lib/geo/world-land.json", JSON.stringify({ source: "Natural Earth 1:110m land via world-atlas", width: WORLD.width, height: WORLD_HEIGHT, d }));
console.log({ rings, split, kb: Math.round(d.length / 1024) });
