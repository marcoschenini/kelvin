import type { NextConfig } from "next";

// Note: this machine blocks native SWC/Turbopack binaries (Application Control),
// so dev/build run on Webpack via the `--webpack` flag in package.json scripts.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: { position: "bottom-right" },
  serverExternalPackages: [
    "@electric-sql/pglite",
    "pdfjs-dist",
    "ai",
    "@ai-sdk/anthropic",
    "@ai-sdk/gateway",
    "@vercel/oidc",
    "@openrouter/ai-sdk-provider",
  ],
  // Files read at runtime that the tracer cannot see (SQL migrations, PGlite wasm/data, pdfjs worker).
  outputFileTracingIncludes: {
    "/*": [
      "./lib/db/migrations/**/*",
      "./node_modules/@electric-sql/pglite/dist/**/*",
      "./node_modules/pdfjs-dist/legacy/build/**/*",
    ],
  },
};

export default nextConfig;
