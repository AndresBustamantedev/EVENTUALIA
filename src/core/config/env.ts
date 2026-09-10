/**
 * Variables de entorno tipadas y validadas con Zod.
 * Importar desde aquí en lugar de acceder a process.env directamente.
 */
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url().optional(),
  FIELD_ENCRYPTION_KEY: z.string().length(64), // 32 bytes en hex = 64 chars
  SEARCH_HMAC_KEY: z.string().length(64),
  STORAGE_PROVIDER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("/app/data/documents"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(20),
  TZ: z.string().default("Europe/Madrid"),
});

function parseEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // En producción, un error de configuración debe detener el proceso
    console.error(
      "❌ Variables de entorno inválidas o ausentes:",
      parsed.error.flatten().fieldErrors
    );
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
    // En desarrollo, devolver un objeto vacío parcial para no bloquear el start
    return process.env as unknown as z.infer<typeof envSchema>;
  }
  return parsed.data;
}

export const env = parseEnv();
