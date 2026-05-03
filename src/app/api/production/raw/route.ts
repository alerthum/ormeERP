import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { createRawProduction } from "@/services/erp-write-service";

export async function POST(request: Request) {
  try {
    await requirePermission(request, "production:write");
    const data = await createRawProduction(await readJson(request));
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
