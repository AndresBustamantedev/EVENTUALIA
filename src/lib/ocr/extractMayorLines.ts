/**
 * Extrae líneas de factura de un documento "mayor de proveedores" via Claude API.
 * El mayor es el listado que el proveedor emite con sus facturas del trimestre.
 * No se loga ni expone el contenido del documento.
 */
import Anthropic from "@anthropic-ai/sdk";

export interface InvoiceLineItem {
  rawDescription: string;
  quantity:         number | null;
  unitPriceInCents: number | null;
  totalInCents:     number | null;
}

export interface VatLineExtracted {
  vatRate:           number;   // 4 | 10 | 21
  baseAmountInCents: number;
  taxInCents:        number;
}

export interface MayorLine {
  invoiceNumber:  string | null;
  amountInCents:  number | null;
  invoiceDate:    string | null;
  lineItems:      InvoiceLineItem[];
  supplierName:   string | null;
  supplierCif:    string | null;
  vatLines:       VatLineExtracted[];
}

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

function isSupportedImageType(mime: string): mime is SupportedImageType {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mime);
}

const EXTRACTION_PROMPT = `Eres un asistente especializado en extraer datos de facturas de proveedores espanoles.
El documento puede contener una o varias facturas (escaneadas o digitales) de uno o varios proveedores.

Responde UNICAMENTE con un array JSON valido, sin texto adicional ni bloques de codigo.
Cada elemento representa UNA factura:

[
  {
    "invoiceNumber": "numero de factura (string o null)",
    "amountInCents": importe total en centimos entero (positivo o negativo). Ej: 1.234,56 = 123456. Nota de abono = negativo. null si no aparece,
    "invoiceDate": "YYYY-MM-DD o null",
    "supplierName": "nombre o razon social del emisor (quien expide la factura), string o null",
    "supplierCif": "CIF o NIF del emisor, sin guiones, string o null",
    "vatLines": [
      {
        "vatRate": tipo de IVA como numero (4, 10 o 21),
        "baseAmountInCents": base imponible para ese tipo en centimos entero,
        "taxInCents": cuota de IVA para ese tipo en centimos entero
      }
    ],
    "lineItems": []
  }
]

Instrucciones:
- Extrae TODAS las facturas visibles. Si solo puedes leer algunos campos, incluyela igualmente con null en los demas.
- Los importes negativos son notas de abono/rectificativas: conservalos negativos.
- supplierName/supplierCif son del EMISOR (el proveedor), no del cliente.
- Si no hay ninguna factura visible en el documento, devuelve [].
- lineItems puede quedar vacio si no hay detalle de lineas.
- vatLines: extrae el desglose de IVA si aparece en la factura. Si hay varios tipos (4%, 10%, 21%) crea una entrada por cada tipo. Si no aparece desglose, devuelve vatLines: [].
- Los importes de vatLines deben ser positivos aunque la factura sea una nota de abono.`;

export async function extractMayorLines(
  fileBuffer: Buffer,
  mimeType: string
): Promise<MayorLine[]> {
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
    throw new Error(`Tipo de archivo no soportado para extraccion de mayor: ${mimeType}`);
  }

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [{ role: "user", content }],
  });

  const rawText = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const match = rawText.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as unknown[];
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => {
      const obj = item as Record<string, unknown>;

      const rawItems = Array.isArray(obj.lineItems) ? (obj.lineItems as Record<string, unknown>[]) : [];
      const lineItems: InvoiceLineItem[] = rawItems.map((li) => ({
        rawDescription:   typeof li.rawDescription === "string" ? li.rawDescription.trim() : "",
        quantity:         typeof li.quantity === "number" ? li.quantity : null,
        unitPriceInCents: typeof li.unitPriceInCents === "number" ? Math.round(Math.abs(li.unitPriceInCents)) : null,
        totalInCents:     typeof li.totalInCents === "number" ? Math.round(Math.abs(li.totalInCents)) : null,
      })).filter((li) => li.rawDescription.length > 0);

      // Parsear vatLines (desglose IVA)
      const rawVatLines = Array.isArray(obj.vatLines) ? (obj.vatLines as Record<string, unknown>[]) : [];
      const vatLines: VatLineExtracted[] = rawVatLines
        .filter(vl => typeof vl.vatRate === "number" && typeof vl.baseAmountInCents === "number" && typeof vl.taxInCents === "number")
        .map(vl => ({
          vatRate:           Math.round(vl.vatRate as number),
          baseAmountInCents: Math.round(Math.abs(vl.baseAmountInCents as number)),
          taxInCents:        Math.round(Math.abs(vl.taxInCents as number)),
        }));

      const rawAmount = obj.amountInCents;
      const amountInCents = typeof rawAmount === "number" ? Math.round(rawAmount) : null;

      return {
        invoiceNumber: typeof obj.invoiceNumber === "string" ? obj.invoiceNumber.trim() || null : null,
        amountInCents,
        invoiceDate:   typeof obj.invoiceDate === "string" && obj.invoiceDate.match(/^\d{4}-\d{2}-\d{2}$/) ? obj.invoiceDate : null,
        lineItems,
        vatLines,
        supplierName:  typeof obj.supplierName === "string" ? obj.supplierName.trim() || null : null,
        supplierCif:   typeof obj.supplierCif === "string" ? obj.supplierCif.replace(/[-\s]/g, "").toUpperCase() || null : null,
      };
    });
  } catch {
    return [];
  }
}
