import { fail, ok, requirePermission } from "@/app/api/_helpers";
import { deactivateUserProfile, updateUserProfile } from "@/services/erp-write-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "settings:write");
    const { id } = await params;
    const body = await request.json();
    return ok(await updateUserProfile(id, body), 200);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, "settings:write");
    const { id } = await params;
    return ok(await deactivateUserProfile(id), 200);
  } catch (error) {
    return fail(error);
  }
}
