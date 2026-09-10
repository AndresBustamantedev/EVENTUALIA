import { requireSession } from "@/core/auth/session";
import { headers } from "next/headers";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserMenu } from "@/components/layout/UserMenu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/";

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} currentPath={pathname} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Cabecera */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
          <div />
          <UserMenu name={user.name ?? "Usuario"} email={user.email ?? ""} />
        </header>

        {/* Contenido principal */}
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
