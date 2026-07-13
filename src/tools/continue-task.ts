import type { ApiClient } from "../api/client.js";
import type { Config } from "../config.js";
import type { SessionStore } from "../session/store.js";
import { agenticPrompt } from "../prompts/agentic.js";
import { textWithUntrusted } from "../utils/prompt-security.js";
import { toolError, toolText } from "../utils/responses.js";
import { continueTaskSchema } from "../utils/validation.js";

export { continueTaskSchema };

export const continueTask = (client: ApiClient, config: Config, sessions: SessionStore) => async (input: unknown) => {
  try {
    const args = continueTaskSchema.parse(input);
    const previous = await sessions.get(args.sessionId);
    const result = await client.complete({
      model: config.textModel,
      messages: [
        { role: "system", content: agenticPrompt(args.maxSteps) },
        {
          role: "user",
          content: textWithUntrusted(
            `Original objective:\n${previous.objective}\n\nPrior summary:\n${previous.summary}\n\nUnresolved issues:\n${
              previous.unresolvedIssues.join("\n") || "None recorded"
            }\n\nNew instruction:\n${args.instruction}`,
            [{ label: "additional_context", content: args.additionalContext }],
          ),
        },
      ],
    });
    const updated = await sessions.update(args.sessionId, { summary: result.text.slice(0, 5000), completed: false });
    return toolText(result, { sessionId: updated.id, sessionUpdatedAt: updated.updatedAt, actualToolExecutionOccurred: false });
  } catch (error) {
    return toolError(error);
  }
};
