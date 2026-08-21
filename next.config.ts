import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg در باندل کلاینت/سرور وارد نشود؛ در زمان اجرا از node_modules خوانده شود
  serverExternalPackages: ["pg"],
};

export default nextConfig;
