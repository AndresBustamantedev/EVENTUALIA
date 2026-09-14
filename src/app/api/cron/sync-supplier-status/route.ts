/**
 * GET /api/cron/sync-supplier-status
 *
 * Endpoint llamado diariamente por una tarea programada.
 * • Desactiva proveedores sin facturas en los últimos 6 meses.
 * • Activa proveedores inactivos con alguna factura en los últimos 3 meses.
 *
 * Protegido con CRON_SECRET en cabecera Authorization.
 */
import { NextResponse } from "next/server";
import { autoSyncSupplierStatusAction } from "@/modules/suppliers/actions/suppliers";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await autoSyncSupplierStatusAction();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/sync-supplier-status]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
