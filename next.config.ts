import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") ?? "",
  trailingSlash: true,
  outputFileTracingRoot: process.cwd(),
  output: "export",
  images: { unoptimized: true },
  devIndicators: false,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
