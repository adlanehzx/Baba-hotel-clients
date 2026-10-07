import type { Metadata } from "next";
import MinibarManager from "@/components/MinibarManager";

export const metadata: Metadata = { title: "Minibar — Baba Hotel" };

export default function MinibarPage() {
  return <MinibarManager />;
}
