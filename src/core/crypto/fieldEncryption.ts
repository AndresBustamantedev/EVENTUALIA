/**
 * Cifrado a nivel de campo — AES-256-GCM
 *
 * Formato del ciphertext almacenado:
 *   base64(iv):base64(ciphertext):base64(authTag)
 *
 * La clave proviene de FIELD_ENCRYPTION_KEY (hex de 64 chars = 32 bytes).
 * El hash de búsqueda usa HMAC-SHA256 con FIELD_HMAC_KEY.
 *
 * SEGURIDAD:
 * - IV aleatorio de 12 bytes por cada cifrado (nunca reutilizar).
 * - GCM garantiza integridad + confidencialidad.
 * - El hash ciego permite buscar por DNI sin almacenar el valor en claro.
 * - No se loguea ningún valor en claro ni ciphertext parcial.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(envVar: string): Buffer {
  const hex = process.env[envVar];
  if (!hex || hex.length !== 64) {
    throw new Error(
      `[crypto] ${envVar} debe ser una cadena hex de 64 caracteres (32 bytes). ` +
        `Génera una con: openssl rand -hex 32 y añádela al .env`
    );
  }
  return Buffer.from(hex, "hex");
}

/** Cifra un valor con AES-256-GCM. Devuelve "iv:ct:tag" en base64. */
export function encrypt(plaintext: string): string {
  const key = getKey("FIELD_ENCRYPTION_KEY");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    ct.toString("base64"),
    tag.toString("base64"),
  ].join(":");
}

/** Descifra un valor cifrado con `encrypt`. Devuelve el texto en claro. */
export function decrypt(ciphertext: string): string {
  const key = getKey("FIELD_ENCRYPTION_KEY");
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("[crypto] Formato de ciphertext inválido");
  }

  const [ivB64, ctB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const tag = Buffer.from(tagB64, "base64");

  if (iv.length !== IV_BYTES) {
    throw new Error("[crypto] IV inválido");
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error("[crypto] Auth tag inválido");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8"
  );
}

/**
 * HMAC-SHA256 ciego para búsqueda sin revelar el valor.
 * Normaliza a mayúsculas y elimina espacios antes de hashear.
 */
export function hashForSearch(value: string): string {
  const key = getKey("SEARCH_HMAC_KEY");
  const normalized = value.trim().toUpperCase();
  return createHmac("sha256", key).update(normalized, "utf8").digest("hex");
}

/**
 * Compara un valor en claro con un hash previamente almacenado.
 * Usa comparación en tiempo constante para evitar timing attacks.
 */
export function verifyHash(plaintext: string, storedHash: string): boolean {
  try {
    const computed = hashForSearch(plaintext);
    // Both must be same length; HMAC-SHA256 always produces 64 hex chars
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(storedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Cifra solo si el valor existe; null → null. */
export function encryptIfPresent(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return encrypt(value);
}

/** Descifra solo si el valor existe; null → null. */
export function decryptIfPresent(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return decrypt(value);
}
