import type { Context } from "@opencode-ai/plugin/promise/plugin"
import { resolveOpenAIOauth } from "./auth.ts"
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
  ctx: Context
  options: ImageOptions
  action: ImageAction
  imageDataUrls: string[]
  requestId: string
}

interface ConnectorResult {
  image: GeneratedImage
  connector: ConnectorId
  model: string
}

interface ImageConnector {
  id: ConnectorId
  model: string
  generate(input: ConnectorInput): Promise<GeneratedImage>
}

const openai: ImageConnector = {
  id: "openai",
  model: IMAGE_MODEL,
  async generate({ ctx, options, action, imageDataUrls, requestId }) {
    const auth = await resolveOpenAIOauth(ctx.integration)
    const request = buildCodexRequest(options, action, imageDataUrls, requestId)
    return generateWithCodex(auth, request, requestId)
  },
}

const connectors: Readonly<Record<ConnectorId, ImageConnector>> = { openai }

const unavailableMessage = (provider: string | undefined): string => {
  const current = provider ? `"${provider}"` : "the current session"
  return (
    `No image generation connector is available for ${current}. ` +
    `Configure fallbackConnector (${CONNECTOR_IDS.join(", ")}) or switch to a supported provider.`
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
  const candidates = connectorCandidates(currentProvider, config)
  if (candidates.length === 0) {
    throw new ConnectorUnavailableError(
      currentProvider ?? "unknown",
      unavailableMessage(currentProvider),
    )
  }

  let unavailable: ConnectorUnavailableError | undefined
  for (const id of candidates) {
    const connector = connectors[id]
    try {
      const image = await connector.generate({ ctx, options, action, imageDataUrls, requestId })
      return { image, connector: id, model: connector.model }
    } catch (error) {
      if (!(error instanceof ConnectorUnavailableError)) throw error
      unavailable = error
    }
  }

  if (unavailable) throw unavailable
  throw new ConnectorUnavailableError(
    currentProvider ?? "unknown",
    unavailableMessage(currentProvider),
  )
}
