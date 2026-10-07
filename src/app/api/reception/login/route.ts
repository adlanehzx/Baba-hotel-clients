import { NextResponse, type NextRequest } from "next/server";
import { checkPassword, createSessionValue, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 800)); // ralentit les essais en série
    return NextResponse.json({ error: "wrong_password" }, { status: 401 });
  }

  const { value, maxAge } = createSessionValue();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
