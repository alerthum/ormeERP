import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { createPurchaseOrder } from "@/services/erp-write-service";

export async function POST(request: Request) {
  try {
    await requirePermission(request, "purchase:write");
    const data = await createPurchaseOrder(await readJson(request));
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
