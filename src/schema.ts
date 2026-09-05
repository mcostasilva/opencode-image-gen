import {
  IMAGE_BACKGROUNDS,
  IMAGE_FORMATS,
  IMAGE_QUALITIES,
  IMAGE_SIZES,
  type ImageAction,
  type ImageBackground,
  type ImageFormat,
  type ImageOptions,
  type ImageQuality,
  type ImageSize,
} from "./types.ts"

const generatePromptProperty = {
  type: "string",
  description:
    "Describe the new image to generate with the configured AI image-generation connector.",
} as const

const editPromptProperty = {
  type: "string",
  description:
    "Describe the new image to generate from the supplied reference images. This is a generative request, not a local file-editing operation.",
} as const

const sizeProperty = {
  type: "string",
  enum: [...IMAGE_SIZES],
  description: "Image size. Defaults to auto.",
} as const

const qualityProperty = {
  type: "string",
  enum: [...IMAGE_QUALITIES],
  description: "Generation quality. Defaults to auto.",
} as const

const backgroundProperty = {
  type: "string",
  enum: [...IMAGE_BACKGROUNDS],
  description: "Background treatment. Defaults to auto.",
} as const

const outputFormatProperty = {
  type: "string",
  enum: [...IMAGE_FORMATS],
  description: "Output file format. Defaults to png.",
} as const

const directoryProperty = {
  type: "string",
  description:
    "Output directory relative to the active session working directory. Use . for that working directory. Must stay inside it.",
} as const

const fileNameProperty = {
  type: "string",
  description:
    "Output filename without a directory. Its extension must match output_format. Existing files are never overwritten; a -v2, -v3, … suffix is added instead.",
} as const

export const generateImageInput = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "directory", "file_name"],
  properties: {
    prompt: generatePromptProperty,
    size: sizeProperty,
    quality: qualityProperty,
    background: backgroundProperty,
    output_format: outputFormatProperty,
    directory: directoryProperty,
    file_name: fileNameProperty,
  },
} as const

export const editImageInput = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "images", "directory", "file_name"],
  properties: {
    prompt: editPromptProperty,
    images: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string" },
      description:
        "One to five local image paths to upload to the AI connector as generative references. The originals are read but never modified. Paths are relative to the session working directory unless absolute and must stay inside it.",
    },
    size: sizeProperty,
    quality: qualityProperty,
    background: backgroundProperty,
    output_format: outputFormatProperty,
    directory: directoryProperty,
    file_name: fileNameProperty,
  },
} as const

const inSet = <T extends string>(value: unknown, allowed: readonly T[]): value is T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)

const asRecord = (input: unknown): Record<string, unknown> => {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Tool input must be an object.")
  }
  return input as Record<string, unknown>
}

const readString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} must be a non-empty string.`)
  }
  return value.trim()
}

const readEnum = <T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  fallback: T,
): T => {
  if (value === undefined) return fallback
  if (!inSet(value, allowed)) {
    throw new Error(`${field} must be one of: ${allowed.join(", ")}.`)
  }
  return value
}

const readImages = (value: unknown, action: ImageAction): string[] => {
  if (action === "generate") {
    if (value !== undefined) {
      throw new Error("generate_image does not accept images. Use edit_image to change an existing image.")
    }
    return []
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("edit_image requires images: an array of one to five local image paths.")
  }
  if (value.length > 5) {
    throw new Error("edit_image accepts at most five input images.")
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`images[${index}] must be a non-empty path.`)
    }
    return item.trim()
  })
}

export const parseImageOptions = (input: unknown, action: ImageAction): ImageOptions => {
  const record = asRecord(input)
  const prompt = readString(record.prompt, "prompt")
  if (!prompt) throw new Error("prompt is required.")
  const directory = readString(record.directory, "directory")
  if (!directory) throw new Error("directory is required. Use . for the session working directory.")
  const fileName = readString(record.file_name, "file_name")
  if (!fileName) throw new Error("file_name is required.")

  return {
    prompt,
    size: readEnum(record.size, "size", IMAGE_SIZES, "auto"),
    quality: readEnum(record.quality, "quality", IMAGE_QUALITIES, "auto"),
    background: readEnum(record.background, "background", IMAGE_BACKGROUNDS, "auto"),
    outputFormat: readEnum(record.output_format, "output_format", IMAGE_FORMATS, "png"),
    directory,
    fileName,
    images: readImages(record.images, action),
  }
}

export const mimeTypeFor = (format: ImageFormat): string => {
  if (format === "jpeg") return "image/jpeg"
  if (format === "webp") return "image/webp"
  return "image/png"
}

export const extensionFor = (format: ImageFormat): string => {
  if (format === "jpeg") return "jpg"
  return format
}

export type { ImageSize, ImageQuality, ImageBackground, ImageFormat }
