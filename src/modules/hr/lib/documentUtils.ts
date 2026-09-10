/**
 * Utilidades para validación y manejo de documentos de empleados.
 *
 * - Validación de MIME real (magic bytes)
 * - Sanitización de nombre de archivo
 * - Comprobación de tamaño
 * - Detección de duplicados por SHA-256
 */
import crypto from "crypto";

// ── Configuración ─────────────────────────────────────────────

/** Tamaño máximo por defecto: 20 MB */
export const MAX_FILE_SIZE_BYTES =
  parseInt(process.env.MAX_DOC_SIZE_BYTES ?? "", 10) || 20 * 1024 * 1024;

/** MIME types permitidos */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Extensiones permitidas por MIME */
export const MIME_EXTENSIONS: Record<AllowedMimeType, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

/** Magic bytes para validación de MIME real (evita MIME spoofing) */
const MAGIC: { bytes: number[]; mask?: number[]; mime: AllowedMimeType }[] = [
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: "application/pdf" },           // %PDF
  { bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg" },                       // JPEG
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: "image/png" }, // PNG
];

// ── Validación de MIME por magic bytes ───────────────────────

/**
 * Detecta el MIME real del buffer por sus magic bytes.
 * Devuelve null si no coincide con ningún tipo permitido.
 */
export function detectMime(buf: Buffer): AllowedMimeType | null {
  for (const { bytes, mime } of MAGIC) {
    if (buf.length < bytes.length) continue;
    if (bytes.every((b, i) => buf[i] === b)) return mime;
  }
  return null;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  detectedMime?: AllowedMimeType;
}

/**
 * Valida un buffer de archivo:
 * 1. Tamaño dentro del límite.
 * 2. MIME real (magic bytes) coincide con los tipos permitidos.
 * 3. La extensión declarada es coherente con el MIME real.
 *
 * @param buf          Contenido del archivo
 * @param declaredName Nombre original del archivo (para comprobar extensión)
 * @param maxBytes     Límite de tamaño (por defecto MAX_FILE_SIZE_BYTES)
 */
export function validateDocumentBuffer(
  buf: Buffer,
  declaredName: string,
  maxBytes = MAX_FILE_SIZE_BYTES
): ValidationResult {
  if (buf.length === 0) {
    return { ok: false, error: "El archivo está vacío." };
  }
  if (buf.length > maxBytes) {
    const mb = Math.round(maxBytes / 1024 / 1024);
    return { ok: false, error: `El archivo supera el límite de ${mb} MB.` };
  }

  const detectedMime = detectMime(buf);
  if (!detectedMime) {
    return {
      ok: false,
      error: "Formato no permitido. Se aceptan PDF, JPG y PNG.",
    };
  }

  // Comprobar coherencia de extensión
  const ext = declaredName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const validExts = MIME_EXTENSIONS[detectedMime];
  if (!validExts.includes(ext)) {
    return {
      ok: false,
      error: `La extensión ${ext} no corresponde al tipo de archivo detectado (${detectedMime}).`,
    };
  }

  return { ok: true, detectedMime };
}

// ── Sanitización de nombre de archivo ────────────────────────

/**
 * Sanitiza el nombre de archivo declarado:
 * - Solo conserva caracteres alfanuméricos, guión, punto y barra baja.
 * - Trunca a 120 caracteres.
 * - Nunca devuelve vacío.
 */
export function sanitizeFilename(name: string): string {
  const ext = name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const base = name
    .replace(/\.[^.]+$/, "")              // quitar extensión
    .replace(/[^a-zA-Z0-9_\- ]/g, "_")   // caracteres no seguros → _
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100)
    .replace(/^_+|_+$/g, "")             // trim guiones bajos
    || "documento";
  return `${base}${ext}`.slice(0, 120);
}

// ── Hash SHA-256 ──────────────────────────────────────────────

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ── Etiquetas de categoría ────────────────────────────────────

export const DOC_CATEGORY_LABELS: Record<string, string> = {
  CONTRACT:        "Contrato",
  ID_DOCUMENT:     "DNI/NIE",
  SOCIAL_SECURITY: "Seguridad Social",
  PAYSLIP:         "Nómina",
  PAYSLIP_SIGNED:  "Nómina firmada",
  SEVERANCE:       "Finiquito",
  SICK_LEAVE:      "Baja médica",
  RETURN_TO_WORK:  "Alta médica",
  VACATION:        "Vacaciones",
  COMMUNICATION:   "Comunicación",
  OTHER:           "Otro",
};

export const DOC_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  SIGNED:  "Firmado",
};

export const DOC_CATEGORIES = Object.keys(DOC_CATEGORY_LABELS) as (keyof typeof DOC_CATEGORY_LABELS)[];
