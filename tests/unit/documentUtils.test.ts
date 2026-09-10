/**
 * Tests: documentUtils — validación MIME, sanitización, SHA-256, categorías.
 */
import { describe, it, expect } from "vitest";
import {
  detectMime,
  validateDocumentBuffer,
  sanitizeFilename,
  sha256Hex,
  MAX_FILE_SIZE_BYTES,
  DOC_CATEGORY_LABELS,
  DOC_STATUS_LABELS,
  DOC_CATEGORIES,
} from "@/modules/hr/lib/documentUtils";

// ── Helpers para crear buffers con magic bytes ───────────────

function pdfBuffer(extra = 0): Buffer {
  // %PDF header
  const buf = Buffer.alloc(8 + extra);
  buf[0] = 0x25; buf[1] = 0x50; buf[2] = 0x44; buf[3] = 0x46;
  return buf;
}

function jpegBuffer(extra = 0): Buffer {
  const buf = Buffer.alloc(3 + extra, 0x00);
  buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff;
  return buf;
}

function pngBuffer(extra = 0): Buffer {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const buf = Buffer.alloc(8 + extra, 0x00);
  signature.forEach((b, i) => { buf[i] = b; });
  return buf;
}

function unknownBuffer(): Buffer {
  return Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
}

// ── detectMime ────────────────────────────────────────────────

describe("detectMime", () => {
  it("detecta application/pdf por magic bytes", () => {
    expect(detectMime(pdfBuffer())).toBe("application/pdf");
  });

  it("detecta image/jpeg por magic bytes", () => {
    expect(detectMime(jpegBuffer())).toBe("image/jpeg");
  });

  it("detecta image/png por magic bytes", () => {
    expect(detectMime(pngBuffer())).toBe("image/png");
  });

  it("devuelve null para formato desconocido", () => {
    expect(detectMime(unknownBuffer())).toBeNull();
  });

  it("devuelve null para buffer vacío", () => {
    expect(detectMime(Buffer.alloc(0))).toBeNull();
  });

  it("devuelve null para buffer demasiado corto para coincidir con PNG", () => {
    // Solo 4 bytes — no alcanza la firma PNG de 8 bytes
    const short = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(detectMime(short)).toBeNull();
  });

  it("no es engañado por un PDF que empieza con bytes JPEG aleatorios incorrectos", () => {
    const buf = Buffer.from([0xff, 0x00, 0x00]); // NO 0xd8 después de 0xff
    expect(detectMime(buf)).toBeNull();
  });
});

// ── validateDocumentBuffer ────────────────────────────────────

describe("validateDocumentBuffer", () => {
  it("acepta un PDF válido con extensión correcta", () => {
    const buf = pdfBuffer(100);
    const result = validateDocumentBuffer(buf, "contrato.pdf");
    expect(result.ok).toBe(true);
    expect(result.detectedMime).toBe("application/pdf");
  });

  it("acepta un JPEG válido con extensión .jpg", () => {
    const buf = jpegBuffer(100);
    const result = validateDocumentBuffer(buf, "foto.jpg");
    expect(result.ok).toBe(true);
    expect(result.detectedMime).toBe("image/jpeg");
  });

  it("acepta un JPEG válido con extensión .jpeg", () => {
    const buf = jpegBuffer(100);
    const result = validateDocumentBuffer(buf, "foto.jpeg");
    expect(result.ok).toBe(true);
    expect(result.detectedMime).toBe("image/jpeg");
  });

  it("acepta un PNG válido", () => {
    const buf = pngBuffer(100);
    const result = validateDocumentBuffer(buf, "imagen.png");
    expect(result.ok).toBe(true);
    expect(result.detectedMime).toBe("image/png");
  });

  it("rechaza un buffer vacío", () => {
    const result = validateDocumentBuffer(Buffer.alloc(0), "vacio.pdf");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/vacío/i);
  });

  it("rechaza un archivo que supera el límite de tamaño", () => {
    const big = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);
    // Poner magic bytes de PDF para que pase la detección MIME
    big[0] = 0x25; big[1] = 0x50; big[2] = 0x44; big[3] = 0x46;
    const result = validateDocumentBuffer(big, "grande.pdf");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/límite/i);
  });

  it("rechaza un formato de archivo no permitido (ZIP)", () => {
    const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const result = validateDocumentBuffer(zipMagic, "archivo.zip");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/formato no permitido/i);
  });

  it("rechaza MIME spoofing: bytes de PDF pero extensión .jpg", () => {
    const buf = pdfBuffer(100);
    const result = validateDocumentBuffer(buf, "truco.jpg");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/extensión/i);
  });

  it("rechaza MIME spoofing: bytes de JPEG pero extensión .pdf", () => {
    const buf = jpegBuffer(100);
    const result = validateDocumentBuffer(buf, "truco.pdf");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/extensión/i);
  });

  it("rechaza MIME spoofing: bytes de PNG pero extensión .pdf", () => {
    const buf = pngBuffer(100);
    const result = validateDocumentBuffer(buf, "truco.pdf");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/extensión/i);
  });

  it("respeta un límite de tamaño personalizado", () => {
    const buf = pdfBuffer(500);
    const smallLimit = 10;
    const result = validateDocumentBuffer(buf, "doc.pdf", smallLimit);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/límite/i);
  });

  it("acepta exactamente el límite de tamaño (no lo supera)", () => {
    // Buffer de exactamente MAX bytes con magic bytes PDF
    const buf = Buffer.alloc(MAX_FILE_SIZE_BYTES);
    buf[0] = 0x25; buf[1] = 0x50; buf[2] = 0x44; buf[3] = 0x46;
    const result = validateDocumentBuffer(buf, "exacto.pdf");
    expect(result.ok).toBe(true);
  });
});

// ── sanitizeFilename ──────────────────────────────────────────

describe("sanitizeFilename", () => {
  it("conserva nombres simples sin cambios significativos", () => {
    const out = sanitizeFilename("contrato.pdf");
    expect(out).toBe("contrato.pdf");
  });

  it("reemplaza espacios por guión bajo", () => {
    const out = sanitizeFilename("mi contrato 2024.pdf");
    expect(out).toContain("_");
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("elimina path traversal y barras", () => {
    const out = sanitizeFilename("../../etc/passwd.pdf");
    expect(out).not.toContain("/");
    expect(out).not.toContain("..");
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("trunca a 120 caracteres", () => {
    const longName = "a".repeat(200) + ".pdf";
    expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(120);
  });

  it("nunca devuelve una cadena vacía (usa 'documento' como fallback)", () => {
    const out = sanitizeFilename("!@#$%.pdf");
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("documento");
  });

  it("conserva la extensión en minúsculas", () => {
    const out = sanitizeFilename("Fichero.PDF");
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("maneja nombres sin extensión (devuelve nombre sanitizado sin punto final)", () => {
    const out = sanitizeFilename("archivo_sin_extension");
    expect(out).toBeTruthy();
    expect(out).not.toMatch(/\.$/);
  });
});

// ── sha256Hex ─────────────────────────────────────────────────

describe("sha256Hex", () => {
  it("devuelve una cadena hexadecimal de 64 caracteres", () => {
    const hash = sha256Hex(Buffer.from("hola mundo"));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("es determinista: mismo contenido → mismo hash", () => {
    const buf = Buffer.from("contenido de prueba");
    expect(sha256Hex(buf)).toBe(sha256Hex(buf));
  });

  it("buffers distintos producen hashes distintos", () => {
    expect(sha256Hex(Buffer.from("a"))).not.toBe(sha256Hex(Buffer.from("b")));
  });

  it("hash conocido de buffer vacío", () => {
    // SHA-256("") = e3b0c44298fc1c149afb...
    const hash = sha256Hex(Buffer.alloc(0));
    expect(hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
});

// ── Constantes ────────────────────────────────────────────────

describe("DOC_CATEGORY_LABELS", () => {
  it("contiene la categoría CONTRACT con etiqueta en español", () => {
    expect(DOC_CATEGORY_LABELS["CONTRACT"]).toBe("Contrato");
  });

  it("contiene PAYSLIP con etiqueta Nómina", () => {
    expect(DOC_CATEGORY_LABELS["PAYSLIP"]).toBe("Nómina");
  });

  it("DOC_CATEGORIES es un array no vacío de claves", () => {
    expect(DOC_CATEGORIES.length).toBeGreaterThan(0);
    expect(DOC_CATEGORIES).toContain("CONTRACT");
    expect(DOC_CATEGORIES).toContain("PAYSLIP");
  });
});

describe("DOC_STATUS_LABELS", () => {
  it("mapea PENDING a Pendiente", () => {
    expect(DOC_STATUS_LABELS["PENDING"]).toBe("Pendiente");
  });

  it("mapea SIGNED a Firmado", () => {
    expect(DOC_STATUS_LABELS["SIGNED"]).toBe("Firmado");
  });
});
