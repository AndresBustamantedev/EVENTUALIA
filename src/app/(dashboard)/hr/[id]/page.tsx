/**
 * Página: Detalle de empleado con pestañas
 * Acceso: ADMIN, RRHH (datos sensibles); ENCARGADO (solo horario)
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission, ForbiddenError } from "@/core/auth/session";
import { getEmployee } from "@/modules/hr/actions/employees";
import { listContracts, createContractAction } from "@/modules/hr/actions/contracts";
import { ContractForm } from "@/modules/hr/components/ContractForm";
import { listSchedules } from "@/modules/hr/actions/schedules";
import { listTimeRecords } from "@/modules/hr/actions/timeRecords";
import { listEmployeeDocuments } from "@/modules/hr/actions/employeeDocuments";
import { StatusBadge } from "@/modules/hr/components/StatusBadge";
import { ScheduleFormWrapper } from "@/modules/hr/components/ScheduleFormWrapper";
import { DocumentUploadForm } from "@/modules/hr/components/DocumentUploadForm";
import { DocumentActions } from "@/modules/hr/components/DocumentActions";
import { DOC_CATEGORY_LABELS, DOC_STATUS_LABELS } from "@/modules/hr/lib/documentUtils";
import { DeleteEmployeeButton } from "@/modules/hr/components/DeleteEmployeeButton";
import { HrContractsList, HrSchedulesList, HrTimeRecordsList } from "@/modules/hr/components/HrEmployeeTabsClient";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  try {
    const e = await getEmployee(id);
    return { title: `${e.fullName} — Cruz Blanca` };
  } catch {
    return { title: "Empleado — Cruz Blanca" };
  }
}

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { tab = "info" } = await searchParams;

  let actor: { role: string };
  try {
    actor = await requirePermission("hr:employees:read");
  } catch (e) {
    if (e instanceof ForbiddenError) redirect("/");
    throw e;
  }

  const canWrite = actor.role === "ADMIN" || actor.role === "RRHH";
  const isAdmin = actor.role === "ADMIN";
  const canSeeSensitive = canWrite;
  const canReadContracts = canWrite;

  let employee;
  try {
    employee = await getEmployee(id);
  } catch {
    notFound();
  }

  const contracts = canReadContracts ? await listContracts(id) : [];
  const schedules = await listSchedules(id);
  const timeRecords = canWrite ? await listTimeRecords(id) : [];
  const documents = canWrite ? await listEmployeeDocuments(id) : [];
  const deletedDocuments = canWrite ? await listEmployeeDocuments(id, true) : [];
  const showDeleted = tab === "documentos-papelera";

  const TABS = [
    { key: "info", label: "Información" },
    ...(canReadContracts ? [{ key: "contracts", label: "Contratos" }] : []),
    { key: "schedule", label: "Horario" },
    ...(canWrite ? [{ key: "jornada", label: "Jornada" }] : []),
    ...(canWrite ? [{ key: "documentos", label: "Documentos" }] : []),
  ];

  // "documentos-papelera" es una vista dentro de la pestaña Documentos
  const resolvedTab = tab === "documentos-papelera" ? "documentos" : tab;
  const activeTab = TABS.find((t) => t.key === resolvedTab) ? resolvedTab : TABS[0].key;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Cabecera */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{employee.fullName}</h1>
            <StatusBadge status={employee.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            Alta: {employee.hireDate}
            {employee.email ? ` · ${employee.email}` : ""}
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Link
              href={`/hr/${id}/edit`}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              Editar
            </Link>
            {isAdmin && (
              <DeleteEmployeeButton
                employeeId={id}
                employeeName={employee.fullName}
              />
            )}
          </div>
        )}
      </div>

      {/* Pestañas */}
      <div className="border-b">
        <nav className="flex gap-1 -mb-px">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/hr/${id}?tab=${t.key}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.key === "documentos" && documents.length > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({documents.length})
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      {/* Contenido por pestaña */}
      {activeTab === "info" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <InfoField label="Nombre completo" value={employee.fullName} />
          <InfoField label="Email" value={employee.email} />
          <InfoField label="Fecha de alta" value={employee.hireDate} />
          <InfoField label="Estado" value={<StatusBadge status={employee.status} />} />
          {employee.status === "TERMINATED" && (
            <InfoField
              label="Fecha de baja"
              value={employee.terminationDate ?? "—"}
            />
          )}
          {canSeeSensitive && (
            <>
              <InfoField
                label="DNI / NIE"
                value={employee.dni}
                sensitive
              />
              <InfoField label="NAF" value={employee.naf} sensitive />
              <InfoField label="Teléfono" value={employee.phone} sensitive />
              <InfoField
                label="Dirección"
                value={employee.address}
                sensitive
                wide
              />
            </>
          )}
          {employee.emergencyContactName && (
            <>
              <InfoField
                label="Contacto de emergencia"
                value={employee.emergencyContactName}
              />
              {canSeeSensitive && (
                <InfoField
                  label="Teléfono emergencia"
                  value={employee.emergencyContactPhone}
                  sensitive
                />
              )}
            </>
          )}
          {employee.notes && (
            <InfoField label="Notas" value={employee.notes} wide />
          )}
        </div>
      )}

      {activeTab === "contracts" && canReadContracts && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-semibold">
              Historial de contratos ({contracts.length})
            </h2>
            <Link
              href={`/hr/${id}?tab=contracts#new-contract`}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              + Nuevo contrato
            </Link>
          </div>

          <HrContractsList contracts={contracts} employeeId={id} canWrite={canWrite} />
          {/* Formulario nuevo contrato */}
          <div id="new-contract" className="rounded-lg border p-4 space-y-3 bg-muted/30">
            <h3 className="text-sm font-semibold">Nuevo contrato</h3>
            <ContractForm employeeId={id} action={createContractAction} />
          </div>
        </div>
      )}

      {activeTab === "jornada" && canWrite && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-semibold">
              Registros de jornada ({timeRecords.length})
            </h2>
            <Link
              href={`/hr/time-records/new?employeeId=${id}`}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              + Crear registro
            </Link>
          </div>

          <HrTimeRecordsList records={timeRecords} employeeId={id} canWrite={canWrite} />
        </div>
      )}

      {activeTab === "documentos" && canWrite && (
        <div className="space-y-6">
          {/* Subir documento */}
          <details className="group rounded-lg border">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium list-none">
              <span>+ Subir nuevo documento</span>
              <span className="text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="border-t px-4 py-4">
              <DocumentUploadForm employeeId={id} />
            </div>
          </details>

          {/* Lista de documentos activos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Documentos ({documents.length})
              </h2>
              {deletedDocuments.filter((d) => d.deletedAt).length > 0 && (
                <Link
                  href={`/hr/${id}?tab=${showDeleted ? "documentos" : "documentos-papelera"}`}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  {showDeleted
                    ? "← Ver activos"
                    : `Papelera (${deletedDocuments.filter((d) => d.deletedAt).length})`}
                </Link>
              )}
            </div>

            {(() => {
              const list = showDeleted
                ? deletedDocuments.filter((d) => d.deletedAt)
                : documents;

              if (list.length === 0) {
                return (
                  <p className="text-sm text-muted-foreground">
                    {showDeleted ? "La papelera está vacía." : "Sin documentos registrados."}
                  </p>
                );
              }

              // Agrupar por año (null → "Sin año")
              const groups: Record<string, typeof list> = {};
              for (const doc of list) {
                const key = doc.year ? String(doc.year) : "Sin año";
                if (!groups[key]) groups[key] = [];
                groups[key].push(doc);
              }
              const sortedKeys = Object.keys(groups).sort((a, b) => {
                if (a === "Sin año") return 1;
                if (b === "Sin año") return -1;
                return Number(b) - Number(a);
              });

              return sortedKeys.map((yearKey) => (
                <div key={yearKey} className="space-y-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2 pb-1 border-b">
                    {yearKey}
                  </h3>
                  {groups[yearKey].map((doc) => (
                    <div
                      key={doc.id}
                      className={`rounded-lg border p-3 space-y-1 ${
                        doc.deletedAt ? "opacity-60 bg-muted/40" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {DOC_CATEGORY_LABELS[doc.category] ?? doc.category}
                            {doc.month
                              ? ` · ${doc.month.toString().padStart(2, "0")}/${doc.year ?? "—"}`
                              : ""}
                            {" · "}
                            <span
                              className={`font-medium ${
                                doc.status === "SIGNED"
                                  ? "text-green-700"
                                  : "text-yellow-700"
                              }`}
                            >
                              {DOC_STATUS_LABELS[doc.status] ?? doc.status}
                            </span>
                          </p>
                          {doc.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {doc.notes}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {doc.originalName} ·{" "}
                            {(doc.sizeBytes / 1024).toFixed(0)} KB · por{" "}
                            {doc.uploadedByName}
                            {doc.deletedAt && doc.deletedByName
                              ? ` · Borrado por ${doc.deletedByName}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {!doc.deletedAt && (
                            <a
                              href={`/api/files/employee-docs/${doc.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              Descargar
                            </a>
                          )}
                          <DocumentActions
                            docId={doc.id}
                            status={doc.status}
                            isDeleted={!!doc.deletedAt}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {activeTab === "schedule" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-semibold">
              Horarios ({schedules.length})
            </h2>
            {canWrite && (
              <Link
                href={`/hr/${id}?tab=schedule#new-schedule`}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                + Nuevo horario
              </Link>
            )}
          </div>

          <HrSchedulesList schedules={schedules} employeeId={id} canWrite={canWrite} />

          {/* Formulario de nuevo horario */}
          {canWrite && (
            <div id="new-schedule" className="rounded-lg border p-6 mt-6">
              <h3 className="text-base font-semibold mb-4">
                Nuevo horario
              </h3>
              {/* Importamos dinámicamente para evitar flash */}
              <ScheduleFormWrapper employeeId={id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Componentes auxiliares ────────────────────────────────────

function InfoField({
  label,
  value,
  sensitive = false,
  wide = false,
}: {
  label: string;
  value: React.ReactNode | null | undefined;
  sensitive?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
        {sensitive && (
          <span className="ml-1 text-muted-foreground/60">🔒</span>
        )}
      </dt>
      <dd className="mt-1 text-sm font-mono">
        {value ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

