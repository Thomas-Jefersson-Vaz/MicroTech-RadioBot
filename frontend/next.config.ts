import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`, // Proxy to Backend
      },
      {
        source: '/auth/:path*',
        destination: `${backendUrl}/auth/:path*`, // Proxy Auth routes too
      },
    ];
  },
};

export default nextConfig;
