import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Old public paths moved into the signed-in app; keep shared links working (query strings carry over).
  async redirects() {
    return [
      { source: "/", has: [{ type: "query", key: "m" }], destination: "/app/prices", permanent: false },
      { source: "/prices", destination: "/app/prices", permanent: false },
      { source: "/item/:key", destination: "/app/items/:key", permanent: false },
      { source: "/kitchen", destination: "/app/kitchen", permanent: false },
      { source: "/account", destination: "/app/account", permanent: false },
    ];
  },
};

export default nextConfig;
