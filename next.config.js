/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: intentionally NOT using `output: 'standalone'`. The custom server
  // (server.ts -> dist/server.js) is compiled to CommonJS and requires packages like
  // `ws` and `livekit-server-sdk` at runtime. Next's standalone trace only emits the
  // ESM variant of those packages, so a CommonJS custom server cannot resolve them.
  // Instead we ship a full production node_modules (see Dockerfile).
  reactStrictMode: false,
  productionBrowserSourceMaps: true,
  webpack: (config, { buildId, dev, isServer, defaultLoaders, nextRuntime, webpack }) => {
    // Important: return the modified config
    config.module.rules.push({
      test: /\.mjs$/,
      enforce: 'pre',
      use: ['source-map-loader'],
    });
    return config;
  },
};

module.exports = nextConfig;
