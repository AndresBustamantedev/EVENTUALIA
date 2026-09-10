/**
 * Extrae productos y precios de una tarifa/catálogo de proveedor via Claude API.
 * El documento puede ser un PDF, foto de revista o lista de precios escaneada.
 * No se loga ni expone el contenido del documento.
 */
import Anthropic from "@anthropic-ai/sdk";

export interface PriceListItem {
  productName:      string;       // nombre del producto/artículo
  presentation:     string;       // descripción de la presentación (ej: "caja 12 uds", "garrafa 5L")
  quantity:         number;       // unidades base incluidas en la presentación (1 si no se especifica)
  unit:             string | null; // unidad base (ej: "L", "kg", "ud") o null
  priceInCents:     number | null; // precio de la presentación en céntimos
  reference:        string | null; // código/referencia del proveedor si aparece
  category:         string | null; // categoría del producto si se puede inferir
}

const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

function isSupportedImageType(mime: string): mime is SupportedImageType {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mime);
}

const EXTRACTION_PROMPT = `Eres un asistente especializado en extraer catálogos de precios de proveedores españoles.
El documento adjunto es una tarifa, revista o catálogo de precios de un proveedor.
Tu tarea es extraer TODOS los productos con sus precios.

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional, sin bloques de código, sin comentarios.
Cada elemento es un producto con exactamente estos campos:

[
  {
    "productName": "nombre del producto tal como aparece en el documento",
    "presentation": "descripción de la presentación (ej: 'caja 12 uds', 'garrafa 5L', 'kg', 'botella 75cl'). Si no hay presentación, usa 'unidad'",
    "quantity": número de unidades base en la presentación como número (1 si no se especifica o no aplica),
    "unit": "unidad base como string ('L', 'kg', 'ud', 'cl', 'ml', 'g') o null si no se especifica",
    "priceInCents": precio en céntimos como entero (number o null). Ejemplo: 12,50€ → 1250,
    "reference": "código o referencia del proveedor si aparece (string o null)",
    "category": "categoría del producto si aparece o puedes inferirla (string o null)"
  }
]

Reglas:
- Incluye TODOS los productos que aparezcan, incluso si faltan algunos campos.
- Los precios deben ser positivos, en céntimos (enteros). Ejemplo: 1.234,56€ → 123456.
- Si hay IVA desglosado, usa el precio TOTAL con IVA incluido.
- Si un producto aparece en varias presentaciones (ej: caja de 6 y caja de 12), crea una entrada por cada presentación.
- Si no encuentras ningún producto, devuelve: []
- No inventes datos que no estén en el documento.`;

export async function extractPriceList(
  fileBuffer: Buffer,
  mimeType: string
): Promise<PriceListItem[]> {
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
    throw new Error(`Tipo de archivo no soportado: ${mimeType}`);
  }

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
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

    return parsed
      .map((item) => {
        const obj = item as Record<string, unknown>;
        return {
          productName:  typeof obj.productName === "string" ? obj.productName.trim().slice(0, 200) : "",
          presentation: typeof obj.presentation === "string" ? obj.presentation.trim().slice(0, 200) : "unidad",
          quantity:     typeof obj.quantity === "number" && obj.quantity > 0 ? obj.quantity : 1,
          unit:         typeof obj.unit === "string" ? obj.unit.trim().slice(0, 20) || null : null,
          priceInCents: typeof obj.priceInCents === "number" ? Math.round(Math.abs(obj.priceInCents)) : null,
          reference:    typeof obj.reference === "string" ? obj.reference.trim().slice(0, 100) || null : null,
          category:     typeof obj.category === "string" ? obj.category.trim().slice(0, 100) || null : null,
        };
      })
      .filter((item) => item.productName.length > 0);
  } catch {
    return [];
  }
}
