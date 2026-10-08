import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Tenant logos and team photos are served from Supabase Storage. The bucket
  // host is environment-specific, so it comes from env rather than a literal.
  images: {
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [
          {
            protocol: 'https',
            hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
  },
};

export default nextConfig;
