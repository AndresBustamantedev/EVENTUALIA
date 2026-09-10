/**
 * Extracción LOCAL de campos de facturas desde PDFs digitales.
 * No usa ninguna API externa: parsea el texto embebido en el PDF
 * directamente del binario (operadores BT/ET del estándar PDF).
 * Solo funciona en PDFs digitales (no escaneados).
 */

import type { ExtractedInvoiceFields } from "./extractInvoiceFields";

// ── Extracción de texto raw del PDF ───────────────────────────────────────────

/**
 * Extrae todo el texto visible embebido en un PDF digital.
 * Lee los bloques BT…ET y decodifica operadores Tj / TJ.
 */
export function extractTextFromPdf(buffer: Buffer): string {
  const raw = buffer.toString("binary");
  const chunks: string[] = [];

  let pos = 0;
  while (true) {
    const btIdx = raw.indexOf("BT", pos);
    if (btIdx === -1) break;
    const etIdx = raw.indexOf("ET", btIdx + 2);
    if (etIdx === -1) break;

    const block = raw.slice(btIdx + 2, etIdx);
    chunks.push(...extractTextFromBlock(block));
    pos = etIdx + 2;
  }

  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function extractTextFromBlock(block: string): string[] {
  const results: string[] = [];

  // Operador TJ: [(texto) -100 (texto2)] TJ
  const tjArrayRe = /\[([^\]]*)\]\s*TJ/g;
  let m: RegExpExecArray | null;
  while ((m = tjArrayRe.exec(block)) !== null) {
    const parts = extractLiteralStrings(m[1]);
    const joined = parts.join("");
    if (joined.trim()) results.push(joined);
  }

  // Operador Tj: (texto) Tj  o  <hex> Tj
  const tjRe = /(\([^)]*\)|<[0-9A-Fa-f\s]*>)\s*Tj/g;
  while ((m = tjRe.exec(block)) !== null) {
    const decoded = decodeToken(m[1]);
    if (decoded.trim()) results.push(decoded);
  }

  // Operadores ' y " (move-and-show)
  const quoteRe = /(\([^)]*\)|<[0-9A-Fa-f\s]*>)\s*["']/g;
  while ((m = quoteRe.exec(block)) !== null) {
    const decoded = decodeToken(m[1]);
    if (decoded.trim()) results.push(decoded);
  }

  return results;
}

function extractLiteralStrings(src: string): string[] {
  const out: string[] = [];
  const re = /(\([^)]*\)|<[0-9A-Fa-f\s]{4,}>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push(decodeToken(m[1]));
  }
  return out;
}

function decodeToken(token: string): string {
  if (token.startsWith("(")) {
    return decodePdfLiteralString(token.slice(1, -1));
  }
  if (token.startsWith("<")) {
    return decodeHexString(token.slice(1, -1).replace(/\s/g, ""));
  }
  return "";
}

function decodePdfLiteralString(s: string): string {
  return s
    .replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b").replace(/\\f/g, "\f")
    .replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\")
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function decodeHexString(hex: string): string {
  if (!hex.length) return "";
  if (hex.length % 4 === 0) {
    try {
      let out = "";
      for (let i = 0; i < hex.length; i += 4) {
        const code = parseInt(hex.slice(i, i + 4), 16);
        if (code > 0) out += String.fromCharCode(code);
      }
      if (/[A-Za-z0-9€,.]/.test(out)) return out;
    } catch { /* fall through */ }
  }
  let out = "";
  for (let i = 0; i + 1 <= hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (code > 0) out += String.fromCharCode(code);
  }
  return out;
}

// ── Parseo de campos de factura española ──────────────────────────────────────

function parseAmountToCents(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(cleaned)) {
    return Math.round(parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) * 100);
  }
  if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(cleaned)) {
    return Math.round(parseFloat(cleaned.replace(/,/g, "")) * 100);
  }
  const n = parseFloat(cleaned.replace(",", "."));
  if (!isNaN(n)) return Math.round(n * 100);
  return null;
}

function parseDate(s: string): string | null {
  const m1 = s.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (m1) {
    const [, d, mo, y] = m1;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

const INVOICE_NUM_PATTERNS = [
  /(?:n[uú]m(?:ero)?\.?\s*(?:de\s*)?factura|factura\s*n[uú]m\.?|invoice\s*(?:no|num|number)\.?)[:\s#]*([A-Z0-9/_\-]{3,30})/i,
  /(?:nº|n°|no\.?)\s*(?:factura)?[:\s]*([A-Z0-9/_\-]{3,30})/i,
];

const DATE_PATTERNS = [
  /(?:fecha\s*(?:de\s*)?(?:factura|emisión|emision)|date)[:\s]*(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4})/i,
  /(\d{1,2}[/.]\d{1,2}[/.]\d{4})/,
];

const TOTAL_PATTERNS = [
  /(?:total\s*(?:a\s*pagar|factura|importe)?|importe\s*total)[:\s€]*([0-9.,]+)/i,
  /(?:total)[:\s€]*([0-9.,]+)/i,
];

const BASE_PATTERNS = [/(?:base\s*imponible|base)[:\s€]*([0-9.,]+)/i];

const VAT_RATE_PATTERNS = [
  /(?:tipo\s*iva|iva\s*(?:\d+\s*%|al))[:\s]*(\d+)\s*%/i,
  /(\d+)\s*%\s*(?:iva)/i,
];

const VAT_AMOUNT_PATTERNS = [
  /(?:cuota\s*iva|cuota\s*de\s*iva)[:\s€]*([0-9.,]+)/i,
];

const CIF_RE = /\b([A-HJ-NP-SUVW]\d{7}[0-9A-J]|[0-9]{8}[A-Z])\b/g;

const SUPPLIER_PATTERNS = [
  /(?:emisor|proveedor|nombre)[:\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúña-z\s,.]{4,60})/i,
  /(?:razón\s*social|razon\s*social)[:\s]*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúña-z\s,.]{4,60})/i,
];

export function parseInvoiceFieldsFromText(text: string): ExtractedInvoiceFields {
  const cifMatches = [...text.matchAll(CIF_RE)];
  const supplierCif = cifMatches.length > 0
    ? cifMatches[0][0].replace(/[-\s]/g, "").toUpperCase()
    : null;

  const invoiceNumber    = firstMatch(text, INVOICE_NUM_PATTERNS);
  const rawDate          = firstMatch(text, DATE_PATTERNS);
  const invoiceDate      = rawDate ? parseDate(rawDate) : null;
  const rawTotal         = firstMatch(text, TOTAL_PATTERNS);
  const totalInCents     = rawTotal ? parseAmountToCents(rawTotal) : null;
  const rawBase          = firstMatch(text, BASE_PATTERNS);
  const baseAmountInCents = rawBase ? parseAmountToCents(rawBase) : null;
  const rawVatRate       = firstMatch(text, VAT_RATE_PATTERNS);
  const vatRate          = rawVatRate ? parseInt(rawVatRate, 10) : null;
  const rawVatAmount     = firstMatch(text, VAT_AMOUNT_PATTERNS);
  const vatAmountInCents = rawVatAmount ? parseAmountToCents(rawVatAmount) : null;
  const supplierName     = firstMatch(text.slice(0, 500), SUPPLIER_PATTERNS);

  return {
    invoiceNumber:     invoiceNumber  ?? null,
    invoiceDate:       invoiceDate    ?? null,
    supplierName:      supplierName   ?? null,
    supplierCif:       supplierCif    ?? null,
    baseAmountInCents: baseAmountInCents ?? null,
    vatRate:           vatRate        ?? null,
    vatAmountInCents:  vatAmountInCents  ?? null,
    totalInCents:      totalInCents   ?? null,
  };
}

/**
 * Punto de entrada: recibe el buffer del PDF, extrae texto y parsea campos.
 * Sin llamadas externas. Solo útil en PDFs digitales (no escaneados).
 */
export function extractInvoiceFieldsLocal(buffer: Buffer): ExtractedInvoiceFields {
  try {
    const text = extractTextFromPdf(buffer);
    if (!text || text.length < 20) return {};
    return parseInvoiceFieldsFromText(text);
  } catch {
    return {};
  }
}
