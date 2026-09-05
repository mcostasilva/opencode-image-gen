export const IMAGE_SIZES = ["auto", "1024x1024", "1536x1024", "1024x1536"] as const
export const IMAGE_QUALITIES = ["auto", "low", "medium", "high"] as const
export const IMAGE_BACKGROUNDS = ["auto", "opaque", "transparent"] as const
export const IMAGE_FORMATS = ["png", "webp", "jpeg"] as const

export type ImageSize = (typeof IMAGE_SIZES)[number]
export type ImageQuality = (typeof IMAGE_QUALITIES)[number]
export type ImageBackground = (typeof IMAGE_BACKGROUNDS)[number]
export type ImageFormat = (typeof IMAGE_FORMATS)[number]
export type ImageAction = "generate" | "edit"

export interface ImageOptions {
  prompt: string
  size: ImageSize
  quality: ImageQuality
  background: ImageBackground
  outputFormat: ImageFormat
  directory: string
  fileName: string
  images: string[]
}

export interface CodexAuth {
  access: string
  accountId: string
}

export interface GeneratedImage {
  id: string
  base64: string
  revisedPrompt?: string
}
