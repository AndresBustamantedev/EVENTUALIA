import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Excluir módulos nativos Node.js del bundle del cliente/edge
  serverExternalPackages: ["@node-rs/argon2", "@react-pdf/renderer", "@anthropic-ai/sdk"],
  // Límite de tamaño para server actions (subida de PDFs grandes)
  // En Next.js 15.x va dentro de experimental
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  } as Record<string, unknown>,
  // Cabeceras de seguridad
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), camera=(), microphone=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
