import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sql } from "@/db/client";

export async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function ok(data: unknown, status = 201) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.";
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function requirePermission(request: Request, permission: string) {
  const profileCount = await sql`select count(*)::int as count from user_profiles where is_active = true`;
  if (Number(profileCount[0]?.count ?? 0) === 0) return;

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Bu işlem için giriş yapmalısınız.");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) throw new Error("Oturum doğrulanamadı.");

  const rows = await sql`
    select r.permissions
    from user_profiles u
    join roles r on r.id = u.role_id
    where lower(u.email) = lower(${data.user.email}) and u.is_active = true and r.is_active = true
    limit 1
  `;
  const permissions = Array.isArray(rows[0]?.permissions) ? rows[0].permissions.map(String) : [];
  if (!permissions.includes(permission) && !permissions.includes("settings:write")) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }
}
