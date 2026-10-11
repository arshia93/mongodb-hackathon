import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@preflight/core"],
  agentRules: false,
};

export default nextConfig;
