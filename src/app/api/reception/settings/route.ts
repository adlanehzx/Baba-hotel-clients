import { NextResponse, type NextRequest } from "next/server";
import { requireReception } from "@/lib/auth";
import { getSettings, saveSettings, validateSettings } from "@/lib/settings";

export async function GET() {
  const denied = await requireReception();
  if (denied) return denied;
  return NextResponse.json(await getSettings(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest) {
  const denied = await requireReception();
  if (denied) return denied;
  const result = validateSettings(await req.json().catch(() => null));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  await saveSettings(result.value);
  return NextResponse.json(result.value);
}
