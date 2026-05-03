import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { createDirectRawMaterialPurchase } from "@/services/erp-write-service";

export async function POST(request: Request) {
  try {
    await requirePermission(request, "purchase:write");
    return ok(await createDirectRawMaterialPurchase(await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}
