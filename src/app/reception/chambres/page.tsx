import type { Metadata } from "next";
import RoomsManager from "@/components/RoomsManager";

export const metadata: Metadata = { title: "Chambres — Baba Hotel" };

export default function RoomsPage() {
  return <RoomsManager />;
}
