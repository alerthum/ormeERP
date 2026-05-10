import { fail, ok, readJson, requirePermission } from "@/app/api/_helpers";
import { createCustomerOrder } from "@/services/erp-write-service";

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, "orders:write");
    const data = await createCustomerOrder(await readJson(request), user);
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
