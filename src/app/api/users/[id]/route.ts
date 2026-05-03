import { fail, ok } from "@/app/api/_helpers";
import { deactivateUserProfile } from "@/services/erp-write-service";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ok(await deactivateUserProfile(id), 200);
  } catch (error) {
    return fail(error);
  }
}
