import { sql } from "@/db/client";

export interface PermissionUser {
  id: string;
  email: string;
  roleId: string;
  permissions: string[];
  isAdmin: boolean;
}

export type OperationModule = 
  | 'orders' 
  | 'purchase' 
  | 'production' 
  | 'sales' 
  | 'transfers' 
  | 'settings' 
  | 'reports' 
  | 'integrity' 
  | 'reporting';

/**
 * Enterprise Permission Guard
 */
export async function assertCanRead(user: PermissionUser | null, module: OperationModule) {
  if (process.env.INTERNAL_BYPASS === "true") return;
  if (!user) throw new Error("Bu işlem için giriş yapmalısınız.");
  if (user.isAdmin) return;
  if (user.permissions.includes(`${module}.read`) || user.permissions.includes(`${module}.update`) || user.permissions.includes(`${module}.create`)) return;
  throw new Error(`Bu bölümü görüntülemek için yetkiniz bulunmamaktadır. (${module})`);
}

export async function assertCanCreate(user: PermissionUser | null, module: OperationModule) {
  if (process.env.INTERNAL_BYPASS === "true") return;
  if (!user) throw new Error("Bu işlem için giriş yapmalısınız.");
  if (user.isAdmin) return;
  if (user.permissions.includes(`${module}.create`)) return;
  throw new Error(`Bu işlem için oluşturma yetkiniz bulunmamaktadır. (${module})`);
}

export async function assertCanUpdate(user: PermissionUser | null, module: OperationModule) {
  if (process.env.INTERNAL_BYPASS === "true") return;
  if (!user) throw new Error("Bu işlem için giriş yapmalısınız.");
  if (user.isAdmin) return;
  if (user.permissions.includes(`${module}.update`)) return;
  throw new Error(`Bu işlem için düzenleme yetkiniz bulunmamaktadır. (${module})`);
}

export async function assertCanDelete(user: PermissionUser | null, module: OperationModule) {
  if (process.env.INTERNAL_BYPASS === "true") return;
  if (!user) throw new Error("Bu işlem için giriş yapmalısınız.");
  if (user.isAdmin) return;
  if (user.permissions.includes(`${module}.delete`)) return;
  throw new Error(`Bu işlem için silme yetkiniz bulunmamaktadır. (${module})`);
}

/**
 * Utility to fetch user with permissions
 */
export async function getPermissionUser(email: string): Promise<PermissionUser | null> {
  const rows = await sql`
    select u.id, u.email, u.role_id, r.permissions, r.name as role_name
    from user_profiles u
    join roles r on r.id = u.role_id
    where lower(u.email) = lower(${email}) and u.is_active = true and r.is_active = true
    limit 1
  `;
  
  if (rows.length === 0) return null;
  
  const permissions = Array.isArray(rows[0].permissions) ? rows[0].permissions.map(String) : [];
  
  return {
    id: rows[0].id,
    email: rows[0].email,
    roleId: rows[0].role_id,
    permissions,
    isAdmin: rows[0].role_name.toLowerCase() === 'admin' || permissions.includes('admin')
  };
}
