/**
 * Servicio de extracción de campos de facturas via Claude API.
 * Acepta PDF (digital o escaneado) e imágenes.
 * No loga ni expone el contenido de los documentos.
 */
import Anthropic from "@anthropic-ai/sdk";

export interface VatLineExtracted {
  vatRate: number;           // 4, 10, 21
  baseAmountInCents: number;
  taxInCents: number;
}

export interface ExtractedInvoiceFields {
  invoiceNumber?: string | null;
  invoiceDate?: string | null;       // YYYY-MM-DD
  supplierName?: string | null;
  supplierCif?: string | null;
  totalInCents?: number | null;
  // Desglose por tipo de IVA (puede haber varios en la misma factura)
  vatLines?: VatLineExtracted[];
  // Campos legacy para facturas con un solo tipo de IVA (retrocompatibilidad)
  baseAmountInCents?: number | null;
  vatRate?: number | null;
  vatAmountInCents?: number | null;
}

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

const EXTRACTION_PROMPT = `Eres un asistente especializado en extraer datos estructurados de facturas españolas.
Analiza el documento adjunto y extrae los campos indicados.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin bloques de código.

Campos a extraer:
{
  "invoiceNumber": "número de factura tal como aparece (string o null)",
  "invoiceDate": "fecha en formato YYYY-MM-DD (string o null)",
  "supplierName": "nombre o razón social del emisor (string o null)",
  "supplierCif": "CIF o NIF del emisor sin guiones (string o null)",
  "totalInCents": "importe total en céntimos como entero (number o null). Ejemplo: 37,04€ → 3704",
  "vatLines": [
    {
      "vatRate": "tipo de IVA como número: 4, 10 o 21 (number)",
      "baseAmountInCents": "base imponible de ese tipo en céntimos como entero (number)",
      "taxInCents": "cuota IVA de ese tipo en céntimos como entero (number)"
    }
  ]
}

IMPORTANTE:
- vatLines debe contener UNA entrada por cada tipo de IVA diferente que aparezca en la factura.
- Si la factura tiene productos al 4%, al 10% y al 21%, vatLines tendrá 3 objetos.
- Si solo hay un tipo de IVA, vatLines tendrá 1 objeto.
- Busca la sección "DETALLE IVA" o "Resumen IVA" al pie de la factura para extraer el desglose.
- Los importes siempre en céntimos como enteros (sin decimales): 26,66€ → 2666.
- Si un campo no aparece o no puedes determinarlo con certeza, usa null (o array vacío para vatLines).`;

function isSupportedImageType(mime: string): mime is SupportedImageType {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mime);
}

function parseVatLines(raw: unknown): VatLineExtracted[] {
  if (!Array.isArray(raw)) return [];
  const result: VatLineExtracted[] = [];
  for (const item of raw) {
    if (
      item && typeof item === "object" &&
      typeof item.vatRate === "number" &&
      typeof item.baseAmountInCents === "number" &&
      typeof item.taxInCents === "number"
    ) {
      result.push({
        vatRate: item.vatRate,
        baseAmountInCents: Math.round(item.baseAmountInCents),
        taxInCents: Math.round(item.taxInCents),
      });
    }
  }
  return result;
}

export async function extractInvoiceFields(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ExtractedInvoiceFields> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada.");

  const client = new Anthropic({ apiKey });
  const base64 = fileBuffer.toString("base64");

  let content: Anthropic.MessageParam["content"];

  if (mimeType === "application/pdf") {
    content = [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      } as unknown as Anthropic.TextBlockParam,
      { type: "text", text: EXTRACTION_PROMPT },
    ];
  } else if (isSupportedImageType(mimeType)) {
    content = [
      {
        type: "image",
        source: { type: "base64", media_type: mimeType, data: base64 },
      },
      { type: "text", text: EXTRACTION_PROMPT },
    ];
  } else {
    throw new Error(`Tipo de archivo no soportado para OCR: ${mimeType}`);
  }

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [{ role: "user", content }],
  });

  const rawText = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) return {};

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const vatLines = parseVatLines(parsed.vatLines);

    // Si hay vatLines, derivar base+vatRate+vatAmount del tipo predominante (para retrocompat)
    let legacyBase: number | null = null;
    let legacyRate: number | null = null;
    let legacyTax: number | null = null;
    if (vatLines.length === 1) {
      legacyBase = vatLines[0].baseAmountInCents;
      legacyRate = vatLines[0].vatRate;
      legacyTax  = vatLines[0].taxInCents;
    } else if (vatLines.length > 1) {
      // tipo con mayor base imponible como "predominante"
      const main = vatLines.reduce((a, b) => a.baseAmountInCents >= b.baseAmountInCents ? a : b);
      legacyBase = main.baseAmountInCents;
      legacyRate = main.vatRate;
      legacyTax  = main.taxInCents;
    }

    return {
      invoiceNumber:     typeof parsed.invoiceNumber === "string" ? parsed.invoiceNumber : null,
      invoiceDate:       typeof parsed.invoiceDate === "string" ? parsed.invoiceDate : null,
      supplierName:      typeof parsed.supplierName === "string" ? parsed.supplierName : null,
      supplierCif:       typeof parsed.supplierCif === "string" ? parsed.supplierCif : null,
      totalInCents:      typeof parsed.totalInCents === "number" ? Math.round(parsed.totalInCents) : null,
      vatLines,
      baseAmountInCents: legacyBase,
      vatRate:           legacyRate,
      vatAmountInCents:  legacyTax,
    };
  } catch {
    return {};
  }
}
