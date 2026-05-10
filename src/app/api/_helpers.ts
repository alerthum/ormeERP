import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sql } from "@/db/client";
import { PermissionUser } from "@/services/write/permission-guard.service";

if (process.env.ERP_AUTH_BYPASS === "true") {
  console.log("⚠️ ERP_AUTH_BYPASS ACTIVE - Authentication is bypassed for this environment.");
} else if (process.env.NODE_ENV === "development") {
  console.log("⚠️ DEVELOPMENT AUTH BYPASS ACTIVE");
}

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
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  
  const isBypass = process.env.ERP_AUTH_BYPASS === "true" || (process.env.NODE_ENV === "development" && !token);

  if (isBypass && !token) {
    console.log("🛠️ BYPASS HIT: Granting bypass-admin access");
    return {
      id: "bypass-admin",
      email: "bypass@orme.erp",
      roleId: "admin",
      permissions: ["*"],
      isAdmin: true,
      isAuthBypass: true
    } as any;
  }

  const profileCount = await sql`select count(*)::int as count from user_profiles where is_active = true`;
  if (Number(profileCount[0]?.count ?? 0) === 0) return;

  if (!token) throw new Error("Bu işlem için giriş yapmalısınız.");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) throw new Error("Oturum doğrulanamadı.");

  const rows = await sql`
    select u.id, u.email, u.role_id, r.permissions, r.name as role_name
    from user_profiles u
    join roles r on r.id = u.role_id
    where lower(u.email) = lower(${data.user.email}) and u.is_active = true and r.is_active = true
    limit 1
  `;
  
  if (rows.length === 0) throw new Error("Kullanıcı profili bulunamadı.");

  const permissions = Array.isArray(rows[0].permissions) ? rows[0].permissions.map(String) : [];
  
  const user = {
    id: rows[0].id,
    email: rows[0].email,
    roleId: rows[0].role_id,
    permissions,
    isAdmin: rows[0].role_name.toLowerCase() === 'admin' || permissions.includes('admin')
  };

  if (!user.isAdmin && !permissions.includes(permission) && !permissions.includes("settings:write")) {
    throw new Error("Bu işlem için yetkiniz yok.");
  }

  return user;
}
