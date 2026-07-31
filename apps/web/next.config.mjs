/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@knowledgeos/database",
    "@knowledgeos/ingestion",
    "@knowledgeos/retrieval",
    "@knowledgeos/sdk",
    "@knowledgeos/shared"
  ],
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"]
    };

    return config;
  }
};

export default nextConfig;
