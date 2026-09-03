import type { NextConfig } from 'next';

const onGitHubPages = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  assetPrefix: onGitHubPages ? '/spectrum-lab/' : undefined,
};

export default nextConfig;
