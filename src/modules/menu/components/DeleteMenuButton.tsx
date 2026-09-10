"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMenuAction } from "@/modules/menu/actions/dailyMenus";
interface Props { menuId: string; }
export function DeleteMenuButton({ menuId }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  function handleDelete() {
    if (!confirm("¿Eliminar este menú borrador? Esta acción no se puede deshacer.")) return;
    startTransition(async () => {
      const result = await deleteMenuAction(menuId);
      if (result.error) alert(result.error); else router.push("/menu");
    });
  }
  return (
    <button onClick={handleDelete} disabled={isPending}
      className="rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors">
      {isPending ? "Eliminando…" : "Eliminar borrador"}
    </button>
  );
}
