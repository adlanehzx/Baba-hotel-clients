import type { Metadata } from "next";
import { isReceptionLoggedIn } from "@/lib/auth";
import { ensureRooms } from "@/lib/rooms";
import ReceptionLogin from "@/components/ReceptionLogin";
import ReceptionShell from "@/components/ReceptionShell";

export const metadata: Metadata = { title: "Réception — Baba Hotel" };

/** Toutes les pages /reception/* demandent le mot de passe de la réception. */
export default async function ReceptionLayout({ children }: { children: React.ReactNode }) {
  if (!(await isReceptionLoggedIn())) return <ReceptionLogin />;
  await ensureRooms();
  return <ReceptionShell>{children}</ReceptionShell>;
}
