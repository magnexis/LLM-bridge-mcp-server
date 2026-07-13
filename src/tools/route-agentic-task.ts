import type { ApiClient } from "../api/client.js";
import type { Config } from "../config.js";
import type { ContextStore } from "../context/store.js";
import type { SessionStore } from "../session/store.js";
import { agenticPrompt } from "../prompts/agentic.js";
import { textWithUntrusted } from "../utils/prompt-security.js";
import { toolError, toolText } from "../utils/responses.js";
import { routeAgenticTaskSchema } from "../utils/validation.js";

export { routeAgenticTaskSchema };

export const routeAgenticTask = (client: ApiClient, config: Config, contexts?: ContextStore, sessions?: SessionStore) => async (input: unknown) => {
  try {
    const args = routeAgenticTaskSchema.parse(input);
    const saved = args.projectContextId && contexts ? await contexts.get(args.projectContextId) : undefined;
    const context = [args.contextCode, saved?.content].filter((value): value is string => Boolean(value)).join("\n\n");
    const result = await client.complete({
      model: config.textModel,
      messages: [
        { role: "system", content: agenticPrompt(args.maxSteps) },
        { role: "user", content: textWithUntrusted(`Task:\n${args.taskDescription}`, [{ label: "project_context", content: context }]) },
      ],
      ...(args.outputFormat === "json" ? { responseJson: true } : {}),
    });
    const session =
      args.createSession && sessions
        ? await sessions.create({
            objective: args.taskDescription,
            summary: result.text.slice(0, 5000),
            unresolvedIssues: [],
            provider: result.provider,
            model: result.model,
            completed: false,
            toolSummary: [],
          })
        : undefined;
    return toolText(result, {
      requestedMaximumSteps: args.maxSteps,
      actualToolExecutionOccurred: false,
      liveInformationAvailable: false,
      projectContextId: args.projectContextId ?? null,
      sessionId: session?.id ?? null,
      outputFormat: args.outputFormat,
      limitations: "GLM proposed work only; it has no inherited host tools.",
    });
  } catch (error) {
    return toolError(error);
  }
};
