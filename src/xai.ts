import sharp from "sharp"
import { mimeFromBytes } from "./paths.ts"
import type { GeneratedImage, ImageAction, ImageFormat, ImageOptions } from "./types.ts"

export const XAI_IMAGE_MODEL = "grok-imagine-image-2.0"
export const XAI_IMAGES_URL = "https://api.x.ai/v1/images"

export interface XaiRequest {
  model: typeof XAI_IMAGE_MODEL
  prompt: string
  n: 1
  response_format: "b64_json"
  quality: "auto" | "low" | "medium"
  aspect_ratio?: ImageOptions["aspectRatio"]
  resolution?: ImageOptions["resolution"]
  image?: { url: string }
  images?: Array<{ url: string }>
}

export const buildXaiRequest = (
  options: ImageOptions,
  action: ImageAction,
  imageDataUrls: string[],
): XaiRequest => {
  if (options.quality === "high") throw new Error("xAI supports quality auto, low, or medium, not high.")
  if (options.background !== "auto") throw new Error("xAI supports background auto only.")
  if (options.aspectRatio !== undefined && options.size !== "auto") {
    throw new Error("aspect_ratio cannot be combined with an explicit size.")
  }
  if (action === "edit" && (imageDataUrls.length < 1 || imageDataUrls.length > 5)) {
    throw new Error("xAI editing requires one to five reference images.")
  }
  if (action === "generate" && imageDataUrls.length) {
    throw new Error("xAI generation does not accept reference images.")
  }
  if (imageDataUrls.some((url) => !/^data:image\/(png|jpeg|webp);base64,/.test(url))) {
    throw new Error("xAI reference images must be PNG, JPEG, or WebP.")
  }
  const ratios = { "1024x1024": "1:1", "1536x1024": "3:2", "1024x1536": "2:3" } as const
  const ratio = options.aspectRatio ?? (options.size === "auto" ? undefined : ratios[options.size])
  return {
    model: XAI_IMAGE_MODEL,
    prompt: options.prompt,
    n: 1,
    response_format: "b64_json",
    quality: options.quality,
    ...(ratio === undefined ? {} : { aspect_ratio: ratio }),
    ...(options.resolution === undefined ? {} : { resolution: options.resolution }),
    ...(action !== "edit" ? {} : imageDataUrls.length === 1
      ? { image: { url: imageDataUrls[0]! } }
      : { images: imageDataUrls.map((url) => ({ url })) }),
  }
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined

export const parseXaiImageResponse = async (
  value: unknown,
  format: ImageFormat,
  requestId: string,
): Promise<GeneratedImage> => {
  const response = asRecord(value)
  const image = Array.isArray(response?.data) ? asRecord(response.data[0]) : undefined
  if (image?.respect_moderation === false) throw new Error("xAI filtered the generated image.")
  const base64 = image?.b64_json
  if (typeof base64 !== "string" || !base64.length || base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("xAI returned no valid base64 image data.")
  }
  const bytes = Buffer.from(base64, "base64")
  const mime = mimeFromBytes(bytes)
  if (image?.mime_type != null && image.mime_type !== mime) {
    throw new Error("xAI returned image data that does not match its MIME type.")
  }
  const metadata = await sharp(bytes).metadata()
  const output = metadata.format === format ? bytes : await sharp(bytes).toFormat(format).toBuffer()
  return {
    id: requestId,
    base64: output.toString("base64"),
    format,
    ...(typeof image?.revised_prompt === "string" ? { revisedPrompt: image.revised_prompt } : {}),
  }
}

export const generateWithXai = async (
  key: string,
  request: XaiRequest,
  action: ImageAction,
  format: ImageFormat,
  requestId: string,
): Promise<GeneratedImage> => {
  const response = await fetch(`${XAI_IMAGES_URL}/${action === "edit" ? "edits" : "generations"}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error(`xAI image request failed (${response.status}): ${await response.text()}`)
  }
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new Error("xAI returned an invalid JSON response.")
  }
  return parseXaiImageResponse(value, format, requestId)
}
