import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sql } from "@/db/client";

/**
 * TODO: Remove or protect with stronger MFA before public launch.
 * This is a temporary emergency maintenance endpoint for production auth recovery.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-admin-setup-secret");
  
  if (!process.env.ADMIN_SETUP_SECRET || secret !== process.env.ADMIN_SETUP_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: "Missing Supabase service role configuration" }, { status: 500 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  
  const adminEmail = "alerthum@yahoo.com";
  const adminPassword = "123Qwe..";
  
  try {
    // 1. Ensure Admin role exists in DB
    let [adminRole] = await sql`select id from roles where lower(name) = 'admin' limit 1`;
    
    if (!adminRole) {
      [adminRole] = await sql`
        insert into roles (id, name, description, permissions, is_active)
        values ('admin', 'Admin', 'Tam yetkili yönetici', '["*"]'::jsonb, true)
        returning id
      `;
    } else {
      await sql`
        update roles 
        set permissions = '["*"]'::jsonb, is_active = true 
        where id = ${adminRole.id}
      `;
    }

    // 2. Manage Auth User
    const { data: users, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) throw listError;

    const existingUser = users.users.find(u => u.email?.toLowerCase() === adminEmail.toLowerCase());
    let authUserId: string;

    if (!existingUser) {
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { full_name: "ERP Admin" }
      });
      if (createError) throw createError;
      authUserId = newUser.user.id;
    } else {
      const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
        password: adminPassword,
        email_confirm: true
      });
      if (updateError) throw updateError;
      authUserId = updatedUser.user.id;
    }
    
    // 3. Ensure profile exists and matches auth ID
    const [profile] = await sql`select id from user_profiles where lower(email) = lower(${adminEmail}) limit 1`;
    
    if (!profile) {
      await sql`
        insert into user_profiles (id, email, full_name, role_id, is_active)
        values (${authUserId}, ${adminEmail}, 'ERP Admin', ${adminRole.id}, true)
      `;
    } else {
      await sql`
        update user_profiles 
        set id = ${authUserId}, role_id = ${adminRole.id}, is_active = true 
        where lower(email) = lower(${adminEmail})
      `;
    }
    
    return NextResponse.json({ 
      ok: true, 
      message: "Admin verified and synchronized",
      data: {
        userId: authUserId,
        email: adminEmail,
        roleId: adminRole.id,
        isConfirmed: true,
        profileSynced: true
      }
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
