// SPDX-License-Identifier: AGPL-3.0-or-later
import { hostname } from "node:os";
import type { NextConfig } from "next";

function allowedDevOrigins() {
  const configured = (process.env.COMMSHUB99_ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return Array.from(new Set(["rue", `${hostname()}.local`, hostname(), ...configured]));
}

const nextConfig: NextConfig = {
  allowedDevOrigins: allowedDevOrigins(),
};

export default nextConfig;
