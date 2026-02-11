import { defineConfig } from './src/libs/next/config/define-config';

const isVercel = !!process.env.VERCEL_ENV;
// Keep webpack file cache on by default for local incremental builds.
// CI/one-shot builds can set DISABLE_WEBPACK_CACHE=1 to avoid PackFileCache
// serialization overhead from large modules.
const disableWebpackCache = process.env.DISABLE_WEBPACK_CACHE === '1';
const disableWebpackBuildWorker = process.env.DISABLE_WEBPACK_BUILD_WORKER === '1';

const nextConfig = defineConfig({
  experimental: {
    webpackBuildWorker: !disableWebpackBuildWorker,
    webpackMemoryOptimizations: true,
  },
  // Vercel serverless optimization: exclude musl binaries
  // Vercel uses Amazon Linux (glibc), not Alpine Linux (musl)
  // This saves ~45MB (29MB canvas-musl + 16MB sharp-musl)
  outputFileTracingExcludes: isVercel
    ? {
        '*': [
          'node_modules/.pnpm/@napi-rs+canvas-*-musl*',
          'node_modules/.pnpm/@img+sharp-libvips-*musl*',
        ],
      }
    : undefined,
  webpack: (webpackConfig, context) => {
    const { dev } = context;
    if (!dev && disableWebpackCache) {
      webpackConfig.cache = false;
    }

    return webpackConfig;
  },
});

export default nextConfig;
