import "server-only";

import { notFound } from "next/navigation";
import { positiveRouteId } from "@/lib/navigation-security";

export function requirePageRouteId(candidate: string): number {
  const id = positiveRouteId(candidate);
  if (id == null) notFound();
  return id;
}
