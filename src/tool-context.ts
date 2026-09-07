import type { Context } from "@opencode-ai/plugin/promise/plugin"
import type { SessionContext } from "@opencode-ai/plugin/promise/session"
import type { PluginConfig } from "./config.ts"
import { resolveImageConnector } from "./connectors.ts"
import { imageInputForConnector } from "./schema.ts"

const actions = { generate_image: "generate", edit_image: "edit" } as const

export const prepareImageTools = async (
  integration: Context["integration"],
  config: PluginConfig,
  event: SessionContext,
): Promise<void> => {
  const names = (Object.keys(actions) as Array<keyof typeof actions>).filter((name) => event.tools[name])
  if (!names.length) return

  try {
    const connector = await resolveImageConnector(integration, config, event.model.providerID)
    const fallback = connector.fallback
      ? `Using ${connector.id} image fallback. Reason: ${connector.fallback.reasons.join("\n")}`
      : ""
    if (fallback) event.system.push({ type: "text", text: fallback })
    for (const name of names) {
      const tool = event.tools[name]!
      // Replace only request-local values. Never mutate the global registration.
      event.tools[name] = {
        description: `${tool.description} Selected connector: ${connector.id}; image model: ${connector.model}. ${fallback} Call this tool directly, not through execute.`,
        input: imageInputForConnector(actions[name], connector.id),
      }
    }
  } catch (error) {
    for (const name of names) delete event.tools[name]
    event.system.push({
      type: "text",
      text: `Image tools are unavailable for this request. ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
