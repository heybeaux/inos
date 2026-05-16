/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@heybeaux/inos-types', '@heybeaux/inos-core'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
