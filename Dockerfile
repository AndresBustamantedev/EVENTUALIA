FROM node:20-alpine

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

EXPOSE 3000

# Copiar assets estáticos al directorio standalone (requerido por output: "standalone")
RUN cp -r .next/static .next/standalone/.next/static && \
    cp -r public .next/standalone/public 2>/dev/null || true

# Copiar fuentes estándar de pdfkit (Helvetica, etc.) al standalone
RUN mkdir -p .next/standalone/node_modules/pdfkit/js/standard-fonts && \
    cp -r node_modules/pdfkit/js/standard-fonts/. .next/standalone/node_modules/pdfkit/js/standard-fonts/

# Arranque directo — NO hacer db push automático en producción (destruye datos).
# Para aplicar cambios de esquema manualmente:
#   docker compose exec app npx prisma db push
# Para correr el seed una única vez:
#   docker compose exec app npx tsx prisma/seed.ts
CMD ["node", ".next/standalone/server.js"]