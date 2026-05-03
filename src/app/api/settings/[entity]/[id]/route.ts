import { deleteSetting, type SettingEntity, updateSetting } from "@/services/erp-write-service";
import { fail, ok, readJson } from "@/app/api/_helpers";

const entities = ["fabricTypes", "colors", "yarnCounts", "processTypes", "warehouses", "partners"] satisfies SettingEntity[];

function isSettingEntity(value: string): value is SettingEntity {
  return entities.includes(value as SettingEntity);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ entity: string; id: string }> }) {
  try {
    const { entity, id } = await params;
    if (!isSettingEntity(entity)) return fail(new Error("Geçersiz ayar tipi."), 404);
    return ok(await updateSetting(entity, id, await readJson(request)), 200);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ entity: string; id: string }> }) {
  try {
    const { entity, id } = await params;
    if (!isSettingEntity(entity)) return fail(new Error("Geçersiz ayar tipi."), 404);
    return ok(await deleteSetting(entity, id), 200);
  } catch (error) {
    return fail(error);
  }
}
