import type { ApiClient } from "../api/client.js";
import type { Config } from "../config.js";
import { knowledgePrompt } from "../prompts/knowledge.js";
import { textWithUntrusted } from "../utils/prompt-security.js";
import { toolError, toolText } from "../utils/responses.js";
import { knowledgeSchema } from "../utils/validation.js";

export { knowledgeSchema };

export const consultKnowledge = (client: ApiClient, config: Config) => async (input: unknown) => {
  try {
    const args = knowledgeSchema.parse(input);
    const result = await client.complete({
      model: config.textModel,
      messages: [
        {
          role: "system",
          content: `${knowledgePrompt(args.responseMode, args.includeUncertainty)}${
            args.verifyAgainstContext ? " Compare supplied context against trained knowledge and identify contradictions without assuming either is correct." : ""
          }`,
        },
        {
          role: "user",
          content: textWithUntrusted(`Question${args.domain ? ` (domain: ${args.domain})` : ""}:\n${args.question}`, [
            { label: "reference_context", content: args.context },
          ]),
        },
      ],
      ...(args.outputFormat === "json" ? { responseJson: true } : {}),
    });
    return toolText(result, {
      domain: args.domain ?? null,
      responseMode: args.responseMode,
      uncertaintyReportingEnabled: args.includeUncertainty,
      liveInformationAvailable: false,
      actualToolExecutionOccurred: false,
      projectContextId: args.projectContextId ?? null,
      verifyAgainstContext: args.verifyAgainstContext,
      outputFormat: args.outputFormat,
      limitations: "Consultation uses trained model knowledge and may be outdated.",
    });
  } catch (error) {
    return toolError(error);
  }
};
