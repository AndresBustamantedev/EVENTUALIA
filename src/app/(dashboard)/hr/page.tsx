/**
 * Página: Lista de empleados
 * Acceso: ADMIN, RRHH, ENCARGADO
 * Vista por defecto: empleados en plantilla (ACTIVE + INACTIVE)
 * Pestaña "Archivo": empleados dados de baja (TERMINATED)
 */
import Link from "next/link";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { redirect } from "next/navigation";
import { listEmployees } from "@/modules/hr/actions/employees";
import { StatusBadge } from "@/modules/hr/components/StatusBadge";
import type { EmployeeStatus } from "@/modules/hr/types";
import { ClickableRow } from "@/components/ClickableRow";

interface PageProps {
  searchParams: Promise<{ tab?: string; status?: string; q?: string }>;
}

export const metadata = { title: "Empleados — Cruz Blanca" };

export default async function HrPage({ searchParams }: PageProps) {
  const params = await searchParams;

  let actor: { role: string };
  try {
    actor = await requirePermission("hr:employees:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  const isArchive = params.tab === "archivo";

  // En plantilla: ACTIVE o INACTIVE filtrable; Archivo: solo TERMINATED
  const status =
    isArchive
      ? "TERMINATED"
      : params.status && ["ACTIVE", "INACTIVE"].includes(params.status)
      ? (params.status as EmployeeStatus)
      : undefined;

  const employees = await listEmployees({
    status,
    excludeTerminated: !isArchive && !status,
    search: params.q,
  });

  // Conteo de bajas para mostrar en la pestaña archivo
  const terminatedCount = isArchive
    ? employees.length
    : (await listEmployees({ status: "TERMINATED" })).length;

  const canWrite = actor.role === "ADMIN" || actor.role === "RRHH";
  const canSeeSensitive = canWrite;

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Empleados</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {employees.length} empleado{employees.length !== 1 ? "s" : ""}
            {isArchive ? " en archivo" : " en plantilla"}
          </p>
        </div>
        {canWrite && !isArchive && (
          <Link
            href="/hr/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + Nuevo empleado
          </Link>
        )}
      </div>

      {/* Tabs: Plantilla / Archivo */}
      <div className="flex gap-1 border-b border-border">
        <Link
          href="/hr"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            !isArchive
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          En plantilla
        </Link>
        <Link
          href="/hr?tab=archivo"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            isArchive
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Archivo / Bajas
          {terminatedCount > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
              {terminatedCount}
            </span>
          )}
        </Link>
      </div>

      {/* Filtros (solo en plantilla) */}
      {!isArchive && (
        <form method="GET" className="flex flex-wrap gap-3">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Buscar por nombre…"
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-56"
          />
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Activos e inactivos</option>
            <option value="ACTIVE">Solo activos</option>
            <option value="INACTIVE">Solo inactivos</option>
          </select>
          <button
            type="submit"
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            Filtrar
          </button>
          {(params.q || params.status) && (
            <Link
              href="/hr"
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Limpiar
            </Link>
          )}
        </form>
      )}

      {/* Filtro de búsqueda en archivo */}
      {isArchive && (
        <form method="GET" className="flex flex-wrap gap-3">
          <input type="hidden" name="tab" value="archivo" />
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Buscar en archivo…"
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-56"
          />
          <button
            type="submit"
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            Buscar
          </button>
          {params.q && (
            <Link
              href="/hr?tab=archivo"
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Limpiar
            </Link>
          )}
        </form>
      )}

      {/* Tabla */}
      {employees.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {isArchive ? (
            <p>No hay empleados dados de baja en el archivo.</p>
          ) : (
            <>
              <p>No hay empleados que coincidan con el filtro.</p>
              {canWrite && (
                <Link
                  href="/hr/new"
                  className="mt-4 inline-block text-sm text-primary hover:underline"
                >
                  Crear el primero
                </Link>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {isArchive && (
            <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 text-xs text-amber-700">
              Empleados dados de baja. Sus datos y documentos se conservan para archivo.
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Nombre</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                {canSeeSensitive && (
                  <th className="px-4 py-3 text-left font-medium">DNI/NIE</th>
                )}
                {canSeeSensitive && (
                  <th className="px-4 py-3 text-left font-medium">Teléfono</th>
                )}
                <th className="px-4 py-3 text-left font-medium">Alta</th>
                <th className="px-4 py-3 text-left font-medium">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {employees.map((emp) => (
                <ClickableRow
                  key={emp.id}
                  href={`/hr/${emp.id}`}
                  className={`hover:bg-muted/20 transition-colors ${
                    isArchive ? "opacity-75" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-medium">{emp.fullName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {emp.email ?? "—"}
                  </td>
                  {canSeeSensitive && (
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {emp.dni ?? "—"}
                    </td>
                  )}
                  {canSeeSensitive && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {emp.phone ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-muted-foreground">
                    {emp.hireDate}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={emp.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/hr/${emp.id}`}
                      className="text-sm text-primary hover:underline"
                     
                    >
                      Ver
                    </Link>
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
