import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requirePermission } from "@/core/auth/session";
import {
  getPackage,
  getCandidateInvoices,
} from "@/modules/gestoria/actions/packages";
import { PackageDetailClient } from "@/modules/gestoria/components/PackageDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function GestoriaPackagePage({ params }: Props) {
  let actor: Awaited<ReturnType<typeof requirePermission>>;
  try {
    actor = await requirePermission("suppliers:read");
  } catch {
    redirect("/login");
  }

  const { id } = await params;
  const data = await getPackage(id);
  if (!data) notFound();

  const { pkg, items } = data;
  const canWrite = actor.role === "ADMIN" || actor.role === "RRHH";

  // Candidatas sólo si el paquete está en borrador
  const candidates =
    pkg.status === "DRAFT"
      ? await getCandidateInvoices(pkg.year, pkg.quarter, pkg.id)
      : [];

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <Link href="/gestoria" className="text-sm text-muted-foreground hover:underline">
        ← Gestoría
      </Link>
      <PackageDetailClient
        pkg={pkg}
        items={items}
        candidates={candidates}
        canWrite={canWrite}
      />
    </div>
  );
}
