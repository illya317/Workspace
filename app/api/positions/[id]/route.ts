// @deprecated 兼容入口，新代码请使用 /api/hr/* 替代。此文件不再新增业务逻辑。
import { handleUpdateField, handleDelete } from "@/lib/crud";

const CONFIG = { entityType: "Position", modelKey: "position" as const, allowedFields: ["code","name","alias","departmentId","positionDescriptionId"] };

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleUpdateField(request, params, CONFIG);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleDelete(request, params, CONFIG);
}
