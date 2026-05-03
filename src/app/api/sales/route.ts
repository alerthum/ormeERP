import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { createSale } from "@/services/erp-write-service";

export async function POST(request: Request) {
  try {
    await requirePermission(request, "sales:write");
    return ok(await createSale(await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}
