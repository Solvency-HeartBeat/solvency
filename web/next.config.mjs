/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_CONTRACT_ID: process.env.NEXT_PUBLIC_CONTRACT_ID ?? '',
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org',
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK ?? 'testnet',
  },
};

export default nextConfig;
