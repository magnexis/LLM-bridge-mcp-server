import type { ApiClient } from "../api/client.js";
import type { Config } from "../config.js";
import { agenticPrompt } from "../prompts/agentic.js";
import { knowledgePrompt } from "../prompts/knowledge.js";
import { reasoningPrompt } from "../prompts/reasoning.js";
import { visionPrompt } from "../prompts/vision.js";
import { loadImage } from "../utils/image.js";
import { textWithUntrusted } from "../utils/prompt-security.js";
import { toolError, toolText } from "../utils/responses.js";
import { smartRouteSchema } from "../utils/validation.js";

export { smartRouteSchema };

type Mode = "agentic" | "reasoning" | "knowledge" | "vision";
const select = (request: string, image?: string): { mode: Mode; reason: string } => {
  const text = request.toLowerCase();
  if (image || /screenshot|layout|visual|ui audit/.test(text)) return { mode: "vision", reason: "image or visual-audit language detected" };
  if (/implement|refactor|migration|plan|multi-step|debug.*project/.test(text)) return { mode: "agentic", reason: "multi-step work language detected" };
  if (/prove|calculate|algorithm|tradeoff|architecture|reason/.test(text)) return { mode: "reasoning", reason: "reasoning bottleneck language detected" };
  return { mode: "knowledge", reason: "safe knowledge-consultation fallback" };
};

export const smartRoute = (client: ApiClient, config: Config) => async (input: unknown) => {
  try {
    const args = smartRouteSchema.parse(input);
    const choice = args.preferredMode === "auto" ? select(args.request, args.imagePath) : { mode: args.preferredMode, reason: "explicit preferredMode" };
    let result;
    if (choice.mode === "vision") {
      if (!args.imagePath) throw new Error("imagePath is required for vision mode.");
      const image = await loadImage(args.imagePath);
      result = await client.complete({
        model: config.visionModel,
        messages: [
          { role: "system", content: visionPrompt },
          { role: "user", content: [{ type: "text", text: args.request }, { type: "image_url", image_url: { url: image.dataUrl } }] },
        ],
      });
    } else {
      const prompt =
        choice.mode === "agentic"
          ? agenticPrompt(args.responseDepth === "deep" ? 20 : 10)
          : choice.mode === "reasoning"
            ? reasoningPrompt
            : knowledgePrompt(args.responseDepth === "brief" ? "concise" : "detailed", true);
      result = await client.complete({
        model: config.textModel,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: textWithUntrusted(args.request, [{ label: "routing_context", content: args.context }]) },
        ],
        ...(choice.mode === "reasoning" ? { enableReasoning: true } : {}),
      });
    }
    return toolText(result, { selectedMode: choice.mode, routingReason: choice.reason, cacheHit: false, liveInformationAvailable: false });
  } catch (error) {
    return toolError(error);
  }
};
