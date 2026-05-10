import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
dotenv.config({ path: ".env.local" });

async function run() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY eksik. Supabase Project Settings > API üzerinden service_role key alınmalı.");
    process.exit(1);
  }

  const { sql } = await import("../src/db/client");
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  
  const adminEmail = "alerthum@yahoo.com";
  const adminPassword = "123Qwe..";
  
  console.log(`Checking admin user in Auth: ${adminEmail}...`);
  
  try {
    // 1. Ensure Admin role exists in DB
    let [adminRole] = await sql`select id from roles where lower(name) = 'admin' limit 1`;
    
    if (!adminRole) {
      console.log("Creating Admin role in DB...");
      [adminRole] = await sql`
        insert into roles (id, name, description, permissions, is_active)
        values ('admin', 'Admin', 'Tam yetkili yönetici', '["*"]'::jsonb, true)
        returning id
      `;
    } else {
      console.log("Updating Admin role permissions in DB...");
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
      console.log(`Creating Auth user for ${adminEmail}...`);
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { full_name: "ERP Admin" }
      });
      if (createError) throw createError;
      authUserId = newUser.user.id;
    } else {
      console.log(`Updating Auth user for ${adminEmail}...`);
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
      console.log(`Creating profile for ${adminEmail}...`);
      await sql`
        insert into user_profiles (id, email, full_name, role_id, is_active)
        values (${authUserId}, ${adminEmail}, 'ERP Admin', ${adminRole.id}, true)
      `;
    } else {
      console.log(`Updating profile for ${adminEmail}...`);
      await sql`
        update user_profiles 
        set id = ${authUserId}, role_id = ${adminRole.id}, is_active = true 
        where lower(email) = lower(${adminEmail})
      `;
    }
    
    console.log("✅ Admin user, role and Auth account verified.");
  } catch (err) {
    console.error("❌ Error ensuring admin user:", err);
    process.exit(1);
  }
  
  process.exit(0);
}

run();
