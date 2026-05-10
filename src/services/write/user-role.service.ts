import { sql } from "@/db/client";
import { id, requireString, optionalString, boolValue, asJson } from "@/services/write/write-utils";
import { assertCanUpdate, type PermissionUser } from "./permission-guard.service";

export async function createRole(payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'settings');
  const recordId = id("role");
  const permissions = Array.isArray(payload.permissions) ? payload.permissions.map(String) : [];
  await sql`
    insert into roles (id, name, description, permissions, is_active, created_at, updated_at)
    values (${recordId}, ${requireString(payload.name, "Rol adı")}, ${optionalString(payload.description) ?? ""}, ${JSON.stringify(permissions)}::jsonb, true, now(), now())
  `;
  return { id: recordId };
}

export async function updateRole(recordId: string, payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'settings');
  const permissions = Array.isArray(payload.permissions) ? payload.permissions.map(String) : [];
  await sql`
    update roles
    set name = ${requireString(payload.name, "Rol adı")},
        description = ${optionalString(payload.description) ?? ""},
        permissions = ${JSON.stringify(permissions)}::jsonb,
        is_active = ${payload.isActive === undefined ? true : boolValue(payload.isActive)},
        updated_at = now()
    where id = ${recordId}
  `;
  return { id: recordId };
}

export async function deleteRole(recordId: string, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'settings');
  await sql`delete from roles where id = ${recordId}`;
  return { id: recordId };
}

export async function createUserProfile(payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'settings');
  const recordId = id("user");
  await sql`
    insert into user_profiles (
      id, email, full_name, role_id, 
      default_purchase_warehouse_id, default_transfer_target_warehouse_id, 
      default_dyehouse_consumption_warehouse_id, default_sales_warehouse_id,
      is_active, created_at, updated_at
    )
    values (
      ${recordId}::text, ${requireString(payload.email, "E-posta")}::text, ${requireString(payload.fullName, "Ad soyad")}::text, ${requireString(payload.roleId, "Rol")}::text,
      ${(payload.defaultPurchaseWarehouseId as string) || null}::text, ${(payload.defaultTransferTargetWarehouseId as string) || null}::text,
      ${(payload.defaultDyehouseConsumptionWarehouseId as string) || null}::text, ${(payload.defaultSalesWarehouseId as string) || null}::text,
      true, now(), now()
    )
  `;
  return { id: recordId };
}

export async function updateUserProfile(recordId: string, payload: Record<string, unknown>, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'settings');
  await sql`
    update user_profiles set
      email = ${requireString(payload.email, "E-posta")}::text,
      full_name = ${requireString(payload.fullName, "Ad soyad")}::text,
      role_id = ${requireString(payload.roleId, "Rol")}::text,
      default_purchase_warehouse_id = ${(payload.defaultPurchaseWarehouseId as string) || null}::text,
      default_transfer_target_warehouse_id = ${(payload.defaultTransferTargetWarehouseId as string) || null}::text,
      default_dyehouse_consumption_warehouse_id = ${(payload.defaultDyehouseConsumptionWarehouseId as string) || null}::text,
      default_sales_warehouse_id = ${(payload.defaultSalesWarehouseId as string) || null}::text,
      updated_at = now()
    where id = ${recordId}::text
  `;
  return { id: recordId };
}

export async function deactivateUserProfile(recordId: string, user: PermissionUser | null = null) {
  await assertCanUpdate(user, 'settings');
  await sql`update user_profiles set is_active = false, updated_at = now() where id = ${recordId}`;
  return { id: recordId };
}
