import { fail, ok } from "@/app/api/_helpers";
import { updateUISettings } from "@/services/erp-write-service";

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const result = await updateUISettings(body);
    return ok(result, 200);
  } catch (error) {
    return fail(error, 500);
  }
}
