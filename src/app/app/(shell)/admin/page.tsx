import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { isAdminEmail } from "@/lib/admin/access";
import { loadAdminOverview } from "@/lib/admin/load";
import { requireUser } from "@/lib/auth/session";

// Vždy čerstvé dáta, iba pre administrátora.
export const instant = false;

// bez názvu v karte: neadministrátor nemá zistiť, že stránka existuje
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminPage() {
  const user = await requireUser("/app/admin");
  // kto nie je administrátor, nesmie sa ani dozvedieť, že stránka existuje
  if (!isAdminEmail(user.email)) notFound();
  return <AdminDashboard data={await loadAdminOverview()} />;
}
