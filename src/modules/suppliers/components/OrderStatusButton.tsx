"use client";

import { useTransition } from "react";
import type { OrderStatus } from "../types";

const NEXT_STATUS: Record<string, OrderStatus> = {
  PENDING: "SENT",
  SENT: "RECEIVED",
};
const NEXT_LABEL: Record<string, string> = {
  PENDING: "Marcar enviado",
  SENT: "Marcar recibido",
};

interface Props {
  orderId: string;
  currentStatus: OrderStatus;
  action: (id: string, status: OrderStatus) => Promise<{ error?: string; success?: boolean }>;
}

export function OrderStatusButton({ orderId, currentStatus, action }: Props) {
  const [pending, startTransition] = useTransition();
  const next = NEXT_STATUS[currentStatus];
  if (!next) return null;

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => { void action(orderId, next); })}
      className="text-xs text-primary border rounded px-2 py-1 hover:bg-muted disabled:opacity-50"
    >
      {pending ? "…" : NEXT_LABEL[currentStatus]}
    </button>
  );
}
