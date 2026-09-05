import type { CodexAuth, GeneratedImage, ImageAction, ImageOptions } from "./types.ts"

export const CODEX_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses"
export const RESPONSE_MODEL = "gpt-5.5"
export const IMAGE_MODEL = "gpt-image-2"
export const ORIGINATOR = "opencode-image-gen"

interface CodexContentItem {
  type: "input_text" | "input_image"
  text?: string
  image_url?: string
}

export interface CodexRequest {
  model: string
  store: boolean
  stream: boolean
  instructions: string
  input: Array<{ role: "user"; content: CodexContentItem[] }>
  tools: Array<{
    type: "image_generation"
    model: typeof IMAGE_MODEL
    moderation: "auto"
    output_compression: number
    output_format: string
    quality: string
    size: string
    background: string
  }>
  tool_choice: { type: "image_generation" }
  parallel_tool_calls: boolean
  prompt_cache_key: string
}

const instructionsFor = (action: ImageAction): string =>
  action === "edit"
    ? "You are an image editing dispatcher. Use the image_generation tool exactly once to edit the provided image(s) according to the user request. Do not write code or reply with text only."
    : "You are an image generation dispatcher. Use the image_generation tool exactly once to create the requested image. Do not write code or reply with text only."

const userTextFor = (action: ImageAction, prompt: string): string =>
  action === "edit" ? `Edit the provided image(s): ${prompt}` : `Generate this image: ${prompt}`

export const buildCodexRequest = (
  options: ImageOptions,
  action: ImageAction,
  imageDataUrls: string[],
  sessionId: string,
): CodexRequest => {
  const content: CodexContentItem[] = [{ type: "input_text", text: userTextFor(action, options.prompt) }]
  for (const image_url of imageDataUrls) {
    content.push({ type: "input_image", image_url })
  }

  return {
    model: RESPONSE_MODEL,
    store: false,
    stream: true,
    instructions: instructionsFor(action),
    input: [{ role: "user", content }],
    tools: [
      {
        type: "image_generation",
        model: IMAGE_MODEL,
        moderation: "auto",
        output_compression: 100,
        output_format: options.outputFormat,
        quality: options.quality,
        size: options.size,
        background: options.background,
      },
    ],
    tool_choice: { type: "image_generation" },
    parallel_tool_calls: true,
    prompt_cache_key: sessionId,
  }
}

const dataPayload = (frame: string): string | undefined => {
  const payload = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim()
  if (!payload || payload === "[DONE]") return undefined
  return payload
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const eventMessage = (event: Record<string, unknown>): string => {
  if (typeof event.message === "string" && event.message.trim()) return event.message
  if (typeof event.code === "string" && event.code.trim()) return event.code
  const response = asRecord(event.response)
  const error = response ? asRecord(response.error) : undefined
  if (error && typeof error.message === "string" && error.message.trim()) return error.message
  return "Codex image generation failed."
}

export const parseCodexImageResponse = (body: string): GeneratedImage => {
  const frames = body.replaceAll("\r\n", "\n").split("\n\n")
  const events: Record<string, unknown>[] = []

  for (const frame of frames) {
    const payload = dataPayload(frame)
    if (!payload) continue
    try {
      const parsed: unknown = JSON.parse(payload)
      const record = asRecord(parsed)
      if (record) events.push(record)
    } catch {
      // Keepalive or non-JSON heartbeat.
    }
  }

  const failed = events.find((event) => event.type === "error" || event.type === "response.failed")
  if (failed) {
    throw new Error(eventMessage(failed))
  }

  const item = events
    .map((event) => (event.type === "response.output_item.done" ? asRecord(event.item) : undefined))
    .find((value) => value?.type === "image_generation_call")

  if (!item) {
    throw new Error("Codex returned no image generation result.")
  }

  const base64 = item.result
  if (typeof base64 !== "string" || base64.length === 0) {
    throw new Error("Codex returned an image without image data.")
  }

  const id = typeof item.id === "string" && item.id.length > 0 ? item.id : crypto.randomUUID()
  const revised =
    (typeof item.revised_prompt === "string" && item.revised_prompt) ||
    (typeof item.revisedPrompt === "string" && item.revisedPrompt) ||
    undefined

  return { id, base64, revisedPrompt: revised }
}

export const generateWithCodex = async (
  auth: CodexAuth,
  request: CodexRequest,
  sessionId: string,
): Promise<GeneratedImage> => {
  const response = await fetch(CODEX_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${auth.access}`,
      "chatgpt-account-id": auth.accountId,
      originator: ORIGINATOR,
      "openai-beta": "responses=experimental",
      accept: "text/event-stream",
      "content-type": "application/json",
      session_id: sessionId,
      "x-client-request-id": sessionId,
      "user-agent": ORIGINATOR,
    },
    body: JSON.stringify(request),
  })

  const body = await response.text()
  if (!response.ok) {
    throw new Error(`Codex image request failed (${response.status}): ${body.slice(0, 500)}`)
  }

  return parseCodexImageResponse(body)
}
