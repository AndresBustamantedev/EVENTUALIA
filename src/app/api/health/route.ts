/**
 * Endpoint de salud.
 * NO revela secretos, versiones internas ni detalles del entorno.
 * Comprueba conectividad a la base de datos.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/core/db/client";

export async function GET() {
  try {
    // Consulta mínima para comprobar conexión a la BD
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch {
    // No revelar detalles del error en la respuesta
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
