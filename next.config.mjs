/** @type {import('next').NextConfig} */
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : "/us/california-wealth-tax";

const nextConfig = {
  ...(basePath ? { basePath } : {}),
  async redirects() {
    return [
      {
        source: "/embed",
        destination: "/",
        permanent: true,
      },
      {
        source: "/embed/:path*",
        destination: "/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
