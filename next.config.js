/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    VITE_PORTAL_USERNAME: process.env.VITE_PORTAL_USERNAME,
    VITE_PORTAL_PASSWORD: process.env.VITE_PORTAL_PASSWORD,
  },
};

export default nextConfig;
