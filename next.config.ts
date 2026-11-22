import type { NextConfig } from "next";

/**
 * Three build modes:
 * - default: full-stack standalone (Node server + SQLite via Prisma)
 * - STATIC_EXPORT=1: pure static export for GitHub Pages. The app runs
 *   entirely in the browser (localStorage ledger via local-server.ts), served
 *   from the /udhaar-khata subpath of aaron-samuvel.github.io.
 * - API_BACKEND_URL=<origin>: proxy every /api/* call to the production
 *   Spring Boot backend (mini-services/udhaar-backend, port 8080). The
 *   frontend is untouched — the same UI runs against either backend because
 *   Spring implements the identical API contract.
 */
const isStaticExport = process.env.STATIC_EXPORT === "1";
const backendUrl = process.env.API_BACKEND_URL;

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
      // beforeFiles rewrites win over the Next.js API routes — when
      // API_BACKEND_URL is set the Spring service owns the whole /api surface.
      ...(backendUrl
        ? {
            rewrites: async () => ({
              beforeFiles: [
                { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
              ],
              afterFiles: [],
              fallback: [],
            }),
          }
        : {}),
    };

export default nextConfig;
