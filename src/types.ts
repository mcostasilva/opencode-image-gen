export const IMAGE_SIZES = ["auto", "1024x1024", "1536x1024", "1024x1536"] as const
export const IMAGE_QUALITIES = ["auto", "low", "medium", "high"] as const
export const IMAGE_BACKGROUNDS = ["auto", "opaque", "transparent"] as const
export const IMAGE_FORMATS = ["png", "webp", "jpeg"] as const
export const IMAGE_ASPECT_RATIOS = [
  "auto", "1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2",
  "9:19.5", "19.5:9", "9:20", "20:9", "1:2", "2:1", "21:9", "5:2",
] as const
export const IMAGE_RESOLUTIONS = ["1k", "2k"] as const

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
  aspectRatio?: (typeof IMAGE_ASPECT_RATIOS)[number]
  resolution?: (typeof IMAGE_RESOLUTIONS)[number]
}

export interface CodexAuth {
  access: string
  accountId: string
}

export interface GeneratedImage {
  id: string
  base64: string
  revisedPrompt?: string
  format?: ImageFormat
}
