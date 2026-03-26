/** @type {import('next').NextConfig} */
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : "/us/california-wealth-tax/embed";

const nextConfig = {
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
