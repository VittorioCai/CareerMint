import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["mammoth", "pdfjs-dist"],
};

export default nextConfig;
