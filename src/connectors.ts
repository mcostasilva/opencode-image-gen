import type { Context } from "@opencode-ai/plugin/promise/plugin"
import { resolveOpenAIOauth, resolveXaiAuth } from "./auth.ts"
import { buildXaiRequest, generateWithXai, XAI_IMAGE_MODEL } from "./xai.ts"
import { buildCodexRequest, generateWithCodex, IMAGE_MODEL } from "./codex.ts"
import {
  CONNECTOR_IDS,
  connectorCandidates,
  type ConnectorId,
  type PluginConfig,
} from "./config.ts"
import { ConnectorUnavailableError } from "./errors.ts"
import type { GeneratedImage, ImageAction, ImageOptions } from "./types.ts"

interface ConnectorInput {
  options: ImageOptions
  action: ImageAction
  imageDataUrls: string[]
  requestId: string
}

interface ConnectorResult {
  image: GeneratedImage
  connector: ConnectorId
  model: string
  billing: "subscription" | "api"
}

interface ImageConnector {
  id: ConnectorId
  model: string
  resolve(integration: Context["integration"]): Promise<{
    billing: "subscription" | "api"
    generate(input: ConnectorInput): Promise<GeneratedImage>
  }>
}

const openai: ImageConnector = {
  id: "openai",
  model: IMAGE_MODEL,
  async resolve(integration) {
    const auth = await resolveOpenAIOauth(integration)
    return {
      billing: "subscription",
      generate: async ({ options, action, imageDataUrls, requestId }) => {
        if (options.aspectRatio !== undefined || options.resolution !== undefined) {
          throw new Error("aspect_ratio and resolution are only supported by the xAI image connector.")
        }
        const request = buildCodexRequest(options, action, imageDataUrls, requestId)
        return generateWithCodex(auth, request, requestId)
      },
    }
  },
}

const xai: ImageConnector = {
  id: "xai",
  model: XAI_IMAGE_MODEL,
  async resolve(integration) {
    const auth = await resolveXaiAuth(integration)
    return {
      billing: auth.billing,
      generate: async ({ options, action, imageDataUrls, requestId }) => {
        const request = buildXaiRequest(options, action, imageDataUrls)
        return generateWithXai(auth.bearer, request, action, options.outputFormat, requestId)
      },
    }
  },
}

const connectors: Readonly<Record<ConnectorId, ImageConnector>> = { openai, xai }

const unavailableMessage = (provider: string | undefined): string => {
  const current = provider ? `"${provider}"` : "the current session"
  return (
    `No image generation connector is available for ${current}. ` +
    `Configure fallbackConnector (${CONNECTOR_IDS.join(", ")}) or switch to a supported provider.`
  )
}

export const resolveConnector = async (integration: Context["integration"], id: ConnectorId) => {
  const connector = connectors[id]
  const resolved = await connector.resolve(integration)
  return {
    id,
    model: connector.model,
    async generate(input: ConnectorInput): Promise<ConnectorResult> {
      const image = await resolved.generate(input)
      return { image, connector: id, model: connector.model, billing: resolved.billing }
    },
  }
}

export const resolveImageConnector = async (
  integration: Context["integration"],
  config: PluginConfig,
  currentProvider: string | undefined,
) => {
  const candidates = connectorCandidates(currentProvider, config)
  if (candidates.length === 0) {
    throw new ConnectorUnavailableError(
      currentProvider ?? "unknown",
      unavailableMessage(currentProvider),
    )
  }

  let unavailable: ConnectorUnavailableError | undefined
  const reasons: string[] = []
  if (currentProvider !== candidates[0]) {
    reasons.push(`No image connector is registered for session provider ${currentProvider ?? "(unset)"}.`)
  }
  for (const id of candidates) {
    try {
      const connector = await resolveConnector(integration, id)
      return { ...connector, fallback: reasons.length ? { connector: id, reasons: [...reasons] } : undefined }
    } catch (error) {
      if (!(error instanceof ConnectorUnavailableError)) throw error
      unavailable = error
      reasons.push(error.message)
    }
  }

  if (unavailable) throw new ConnectorUnavailableError(unavailable.connector, reasons.join("\n"))
  throw new ConnectorUnavailableError(
    currentProvider ?? "unknown",
    unavailableMessage(currentProvider),
  )
}

export const generateWithConnector = async (
  ctx: Context,
  config: PluginConfig,
  currentProvider: string | undefined,
  options: ImageOptions,
  action: ImageAction,
  imageDataUrls: string[],
  requestId: string,
): Promise<ConnectorResult> => {
  const connector = await resolveImageConnector(ctx.integration, config, currentProvider)
  return connector.generate({ options, action, imageDataUrls, requestId })
}
