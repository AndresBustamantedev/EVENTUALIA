"use client";

import { useTransition } from "react";

interface Props {
  invoiceId: string;
  isPaid: boolean;
  action: (id: string, paid: boolean) => Promise<{ error?: string; success?: boolean }>;
}

export function MarkPaidButton({ invoiceId, isPaid, action }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => { void action(invoiceId, !isPaid); })}
      className="text-xs text-primary hover:underline disabled:opacity-50"
    >
      {pending ? "…" : isPaid ? "Marcar pendiente" : "Marcar pagada"}
    </button>
  );
}
