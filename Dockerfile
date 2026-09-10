# ============================================================
# Dockerfile de desarrollo
# Para producción (Fase 4) se usará una imagen multi-stage
# ============================================================
FROM node:20-alpine

# Librerías necesarias para binarios nativos (@node-rs/argon2)
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Instalar dependencias primero (capa cacheada)
COPY package.json package-lock.json* ./
RUN npm ci

# Copiar el código fuente
COPY . .

# Generar el cliente Prisma
RUN npx prisma generate

EXPOSE 3000

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

# Entrypoint: sincroniza schema (dev) + seed (idempotente) + servidor
# prisma db push crea las tablas directamente desde schema.prisma sin necesitar
# archivos de migración. Cuando tengamos migraciones generadas, cambiar a migrate deploy.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npx tsx prisma/seed.ts && npm run dev"]
