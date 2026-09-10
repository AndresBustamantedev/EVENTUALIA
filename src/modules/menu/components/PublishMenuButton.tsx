"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishMenuAction, unpublishMenuAction } from "@/modules/menu/actions/dailyMenus";
interface Props { menuId: string; isActive: boolean; }
export function PublishMenuButton({ menuId, isActive }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  function handleToggle() {
    startTransition(async () => {
      const result = isActive ? await unpublishMenuAction(menuId) : await publishMenuAction(menuId);
      if (result.error) alert(result.error); else router.refresh();
    });
  }
  return (
    <button onClick={handleToggle} disabled={isPending}
      className={isActive
        ? "rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted transition-colors"
        : "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"}>
      {isPending ? (isActive ? "Desactivando…" : "Publicando…") : (isActive ? "Desactivar menú" : "Publicar menú")}
    </button>
  );
}
