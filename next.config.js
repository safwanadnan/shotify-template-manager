/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  env: {
    PORTAL_USERNAME: process.env.PORTAL_USERNAME,
    PORTAL_PASSWORD: process.env.PORTAL_PASSWORD,
  },
};

export default nextConfig;
