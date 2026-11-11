import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_TV_VERSION: process.env.COMMIT_REF ?? "",
  },
};

export default nextConfig;
