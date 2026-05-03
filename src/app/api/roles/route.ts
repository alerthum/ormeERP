import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { createRole } from "@/services/erp-write-service";

export async function POST(request: Request) {
  try {
    await requirePermission(request, "settings:write");
    return ok(await createRole(await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}
