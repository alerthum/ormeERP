import { createSetting, type SettingEntity } from "@/services/erp-write-service";
import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";

const entities = ["fabricTypes", "colors", "yarnCounts", "processTypes", "warehouses", "partners"] satisfies SettingEntity[];

function isSettingEntity(value: string): value is SettingEntity {
  return entities.includes(value as SettingEntity);
}

export async function POST(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    await requirePermission(request, "settings:write");
    const { entity } = await params;
    if (!isSettingEntity(entity)) return fail(new Error("Geçersiz ayar tipi."), 404);
    const payload = await readJson(request);
    const data = await createSetting(entity, payload);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
