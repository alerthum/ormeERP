import { sql } from "@/db/client";
import type { PermissionUser } from "./permission-guard.service";

/**
 * Operation Lock Guard
 */
export async function assertOperationDateUnlocked({
  operationDate,
  user,
  operationType
}: {
  operationDate: string | Date;
  user: PermissionUser | null;
  operationType: 'create' | 'update' | 'delete';
}) {
  // 1. Fetch settings
  const settingsRow = await sql`select data from ui_settings where id = 'global' limit 1`;
  const settings = settingsRow[0]?.data || {};
  
  const lockActive = settings.operationLockActive;
  const lockDateStr = settings.operationLockDate;
  const overrideRoleId = settings.lockOverrideRoleId;

  if (!lockActive || !lockDateStr) return;

  // Admin always overrides
  if (user?.isAdmin) return;
  
  // Specific role override
  if (user?.roleId && overrideRoleId && user.roleId === overrideRoleId) return;

  const lockDate = new Date(lockDateStr);
  const opDate = new Date(operationDate);

  // If operation date is before or equal to lock date, block it
  // (Usually lock date means "everything before this date is locked")
  if (opDate <= lockDate) {
    throw new Error(
      `Bu işlem dönemi (${lockDateStr} ve öncesi) kilitlenmiştir. ` +
      `Kilitli tarihlerde ${operationType === 'delete' ? 'silme' : 'güncelleme/oluşturma'} yapılamaz.`
    );
  }
}
