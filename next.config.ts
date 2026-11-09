import type { NextConfig } from "next";

// Note: this machine blocks native SWC/Turbopack binaries (Application Control),
// so dev/build run on Webpack via the `--webpack` flag in package.json scripts.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: { position: "bottom-right" },
  serverExternalPackages: ["@electric-sql/pglite", "pdfjs-dist"],
};

export default nextConfig;
