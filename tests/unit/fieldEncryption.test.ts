/**
 * Tests unitarios — cifrado de campos sensibles
 *
 * Prueba: encrypt/decrypt round-trip, HMAC para búsqueda, helpers.
 * No se prueban valores de texto reales (nombres, DNI, etc.) en logs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// ── Configurar claves de test en process.env antes de importar el módulo
beforeAll(() => {
  // Claves ficticias de 64 hex (32 bytes) solo para tests
  process.env.FIELD_ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  process.env.SEARCH_HMAC_KEY =
    "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
});

afterAll(() => {
  delete process.env.FIELD_ENCRYPTION_KEY;
  delete process.env.SEARCH_HMAC_KEY;
});

// Importación dinámica para que beforeAll haya fijado las env vars
async function getModule() {
  return await import("../../src/core/crypto/fieldEncryption");
}

describe("encrypt / decrypt", () => {
  it("devuelve formato iv:ct:tag", async () => {
    const { encrypt } = await getModule();
    const ct = encrypt("texto de prueba");
    const parts = ct.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it("round-trip: decrypt(encrypt(x)) === x", async () => {
    const { encrypt, decrypt } = await getModule();
    const original = "Dato sensible de prueba 12345";
    expect(decrypt(encrypt(original))).toBe(original);
  });

  it("cada cifrado produce un ciphertext distinto (IV aleatorio)", async () => {
    const { encrypt } = await getModule();
    const plain = "mismo texto";
    const ct1 = encrypt(plain);
    const ct2 = encrypt(plain);
    expect(ct1).not.toBe(ct2); // IV diferente → ciphertext diferente
  });

  it("lanza error si el ciphertext tiene formato incorrecto", async () => {
    const { decrypt } = await getModule();
    expect(() => decrypt("malformado")).toThrow();
    expect(() => decrypt("a:b")).toThrow();
  });
});

describe("hashForSearch / verifyHash", () => {
  it("produce un hash hex de 64 chars", async () => {
    const { hashForSearch } = await getModule();
    const h = hashForSearch("12345678A");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("normaliza a mayúsculas antes de hashear", async () => {
    const { hashForSearch } = await getModule();
    expect(hashForSearch("12345678a")).toBe(hashForSearch("12345678A"));
    expect(hashForSearch("  12345678A  ")).toBe(hashForSearch("12345678A"));
  });

  it("verifyHash devuelve true para el valor correcto", async () => {
    const { hashForSearch, verifyHash } = await getModule();
    const stored = hashForSearch("12345678A");
    expect(verifyHash("12345678A", stored)).toBe(true);
    expect(verifyHash("12345678a", stored)).toBe(true); // normalización
  });

  it("verifyHash devuelve false para valor incorrecto", async () => {
    const { hashForSearch, verifyHash } = await getModule();
    const stored = hashForSearch("12345678A");
    expect(verifyHash("99999999Z", stored)).toBe(false);
  });
});

describe("encryptIfPresent / decryptIfPresent", () => {
  it("null → null", async () => {
    const { encryptIfPresent, decryptIfPresent } = await getModule();
    expect(encryptIfPresent(null)).toBeNull();
    expect(encryptIfPresent(undefined)).toBeNull();
    expect(encryptIfPresent("")).toBeNull();
    expect(decryptIfPresent(null)).toBeNull();
    expect(decryptIfPresent(undefined)).toBeNull();
  });

  it("valor presente → cifra y descifra correctamente", async () => {
    const { encryptIfPresent, decryptIfPresent } = await getModule();
    const original = "Teléfono ficticio 600000000";
    const ct = encryptIfPresent(original);
    expect(ct).not.toBeNull();
    expect(decryptIfPresent(ct)).toBe(original);
  });
});

describe("getKey — validación de claves", () => {
  it("lanza error si la clave env no tiene 64 chars", async () => {
    const savedKey = process.env.FIELD_ENCRYPTION_KEY;
    process.env.FIELD_ENCRYPTION_KEY = "demasiado_corta";
    const { encrypt } = await getModule();
    expect(() => encrypt("algo")).toThrow("[crypto]");
    process.env.FIELD_ENCRYPTION_KEY = savedKey;
  });
});
