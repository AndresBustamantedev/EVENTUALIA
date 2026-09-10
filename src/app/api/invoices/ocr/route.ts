/**
 * POST /api/invoices/ocr
 * Extrae campos estructurados de un PDF o imagen de factura.
 * Requiere permiso suppliers:write.
 * No loga el contenido del documento.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/core/auth/session";
import { validateDocumentBuffer } from "@/modules/hr/lib/documentUtils";
import { extractInvoiceFields } from "@/lib/ocr/extractInvoiceFields";

const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(req: NextRequest) {
  try {
    await requirePermission("suppliers:write");
  } catch {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "El archivo supera el límite de 20 MB." }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Validar mime real (no confiar solo en file.type)
  const validation = validateDocumentBuffer(buf, file.name);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 415 });
  }

  const mimeType = validation.detectedMime!;
  if (!ALLOWED_MIME.includes(mimeType)) {
    return NextResponse.json(
      { error: `Tipo no soportado para extracción: ${mimeType}` },
      { status: 415 }
    );
  }

  try {
    const fields = await extractInvoiceFields(buf, mimeType);
    return NextResponse.json({ fields });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error desconocido en OCR.";
    // No exponer detalles internos al cliente
    console.error("[OCR] Error de extracción:", msg);
    return NextResponse.json(
      { error: "No se pudieron extraer los datos. Comprueba que el archivo es legible." },
      { status: 500 }
    );
  }
}
