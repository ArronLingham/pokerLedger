import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phones/other devices on the local network to load dev resources
  // (HMR, etc.) when you open the app via the machine's LAN IP in development.
  // Dev-only; has no effect on production builds.
  allowedDevOrigins: ["192.168.2.242", "192.168.2.243"],
};

export default nextConfig;
