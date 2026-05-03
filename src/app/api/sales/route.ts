import { fail, ok, readJson } from "@/app/api/_helpers";
import { createSale } from "@/services/erp-write-service";

export async function POST(request: Request) {
  try {
    return ok(await createSale(await readJson(request)));
  } catch (error) {
    return fail(error);
  }
}
