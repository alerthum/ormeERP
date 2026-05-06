import { fail, ok, requirePermission } from "@/app/api/_helpers";
import { repairOperationalIntegrity } from "@/services/integrity-service";

export async function POST(request: Request) {
  try {
    await requirePermission(request, "settings:write");
    const result = await repairOperationalIntegrity();
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
