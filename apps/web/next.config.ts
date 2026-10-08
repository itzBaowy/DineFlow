import { config } from 'dotenv';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

config({ path: resolve(process.cwd(), '../../.env'), quiet: true });
const apiUrl = process.env.API_INTERNAL_URL;
if (!apiUrl || !['http:', 'https:'].includes(new URL(apiUrl).protocol)) throw new Error('API_INTERNAL_URL phải là http(s) URL; chạy pnpm setup:env');
const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ['@dineflow/shared'],
  async rewrites() { return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }]; },
  async headers() { return [{ source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'X-Frame-Options', value: 'DENY' }] }]; },
};
export default nextConfig;
