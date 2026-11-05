/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxy /api to the backend in dev so the browser talks to one origin.
  async rewrites() {
    const api = process.env.API_URL || 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};
export default nextConfig;
