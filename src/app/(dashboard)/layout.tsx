import { requireSession } from "@/core/auth/session";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserMenu } from "@/components/layout/UserMenu";
import { prisma } from "@/core/db/client";

/** Facturas "pendientes de asignar": aquellas cuyo proveedor está inactivo
 *  (tanto "Sin asignar" como proveedores auto-creados desde email inbound). */
async function getPendingInvoicesCount(): Promise<number> {
  try {
    const count = await (prisma as any).invoice.count({
      where: {
        supplier: { isActive: false },
        deletedAt: null,
      },
    });
    return count as number;
  } catch {
    return 0;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  const pendingInvoices = await getPendingInvoicesCount();

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} pendingInvoices={pendingInvoices} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Cabecera */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
          {/* Espacio para el botón hamburger en móvil */}
          <div className="w-14 md:hidden" />
          <div className="hidden md:block" />
          <UserMenu name={user.name ?? "Usuario"} email={user.email ?? ""} />
        </header>

        {/* Contenido principal */}
        <main className="flex-1 p-4 md:p-6 overflow-auto pb-20 md:pb-6">{children}</main>
      </div>
    </div>
  );
}
