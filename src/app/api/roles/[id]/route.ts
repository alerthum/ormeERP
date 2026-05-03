import { fail, ok, readJson } from "@/app/api/_helpers";
import { deleteRole, updateRole } from "@/services/erp-write-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ok(await updateRole(id, await readJson(request)), 200);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ok(await deleteRole(id), 200);
  } catch (error) {
    return fail(error);
  }
}
