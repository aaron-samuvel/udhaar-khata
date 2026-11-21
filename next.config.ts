import type { NextConfig } from "next";

/**
 * Two build modes:
 * - default: full-stack standalone (Node server + SQLite via Prisma)
 * - STATIC_EXPORT=1: pure static export for GitHub Pages. The app runs
 *   entirely in the browser (localStorage ledger via local-server.ts), served
 *   from the /udhaar-khata subpath of aaron-samuvel.github.io.
 */
const isStaticExport = process.env.STATIC_EXPORT === "1";

const shared = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

const nextConfig: NextConfig = isStaticExport
  ? {
      ...shared,
      output: "export",
      trailingSlash: true,
      basePath: "/udhaar-khata",
      distDir: ".next-static",
      images: { unoptimized: true },
    }
  : {
      ...shared,
      output: "standalone",
    };

export default nextConfig;
