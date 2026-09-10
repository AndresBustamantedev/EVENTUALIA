"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

interface Props {
  href: string;
  children: ReactNode;
  className?: string;
}

/**
 * Table row (<tr>) that navigates to `href` on click.
 * Use instead of <tr> in server-component tables where entire row should be clickable.
 */
export function ClickableRow({ href, children, className = "" }: Props) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(href)}
      className={`cursor-pointer ${className}`}
      role="link"
    >
      {children}
    </tr>
  );
}
