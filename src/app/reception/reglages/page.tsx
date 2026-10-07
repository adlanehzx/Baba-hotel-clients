import type { Metadata } from "next";
import SettingsForm from "@/components/SettingsForm";

export const metadata: Metadata = { title: "Réglages — Baba Hotel" };

export default function SettingsPage() {
  return <SettingsForm />;
}
