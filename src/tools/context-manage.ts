import type { ContextStore } from "../context/store.js";
import { toolError } from "../utils/responses.js";
import { contextManageSchema } from "../utils/validation.js";

export { contextManageSchema };
type Context = Awaited<ReturnType<ContextStore["get"]>>;
const safe = (value: Context) => ({ id: value.id, name: value.name, content: value.content, tags: value.tags, projectPath: value.projectPath ?? null, createdAt: value.createdAt, updatedAt: value.updatedAt });

export const contextManage = (store: ContextStore) => async (input: unknown) => {
  try {
    const args = contextManageSchema.parse(input);
    if (args.action === "create") {
      const value = await store.create({ name: args.name!, content: args.content!, ...(args.tags ? { tags: args.tags } : {}), ...(args.projectPath ? { projectPath: args.projectPath } : {}) });
      return { content: [{ type: "text" as const, text: JSON.stringify(safe(value), null, 2) }] };
    }
    if (args.action === "list") return { content: [{ type: "text" as const, text: JSON.stringify((await store.list()).map(safe), null, 2) }] };
    if (args.action === "get") return { content: [{ type: "text" as const, text: JSON.stringify(safe(await store.get(args.contextId!)), null, 2) }] };
    if (args.action === "delete") return { content: [{ type: "text" as const, text: JSON.stringify({ contextId: args.contextId, deleted: await store.delete(args.contextId!) }) }] };
    const value = await store.update(args.contextId!, { ...(args.name !== undefined ? { name: args.name } : {}), ...(args.content !== undefined ? { content: args.content } : {}), ...(args.tags !== undefined ? { tags: args.tags } : {}), ...(args.projectPath !== undefined ? { projectPath: args.projectPath } : {}) });
    return { content: [{ type: "text" as const, text: JSON.stringify(safe(value), null, 2) }] };
  } catch (error) { return toolError(error); }
};
