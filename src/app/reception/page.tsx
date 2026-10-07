import type { Metadata } from "next";
import { isReceptionLoggedIn } from "@/lib/auth";
import ReceptionLogin from "@/components/ReceptionLogin";
import ReceptionBoard from "@/components/ReceptionBoard";

export const metadata: Metadata = { title: "Réception — Baba Hotel" };

export default async function ReceptionPage() {
  return (await isReceptionLoggedIn()) ? <ReceptionBoard /> : <ReceptionLogin />;
}
