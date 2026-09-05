import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { extensionFor, mimeTypeFor } from "./schema.ts"
import type { ImageFormat } from "./types.ts"

export const MAX_REFERENCE_BYTES = 50 * 1024 * 1024
export const MAX_REFERENCE_IMAGES = 5

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const JPEG = Buffer.from([0xff, 0xd8, 0xff])
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38])

export const expandHome = (value: string): string => {
  if (value === "~") return homedir()
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(homedir(), value.slice(2))
  }
  return value
}

export const isInsideRoot = (root: string, candidate: string): boolean => {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(candidate)
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)
}

export const resolveInsideProject = (root: string, input: string, label: string): string => {
  const expanded = expandHome(input)
  const absolute = path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(root, expanded)
  if (!isInsideRoot(root, absolute)) {
    throw new Error(`${label} must stay inside the session working directory: ${input}`)
  }
  return absolute
}

const outputFileName = (fileName: string, format: ImageFormat): string => {
  if (fileName === "." || fileName === ".." || fileName.includes("/") || fileName.includes("\\")) {
    throw new Error("file_name must be a filename only. Use directory for its destination.")
  }

  const extension = path.extname(fileName).toLowerCase()
  if (!extension) return `${fileName}.${extensionFor(format)}`

  const accepted = format === "jpeg" ? [".jpg", ".jpeg"] : [`.${extensionFor(format)}`]
  if (!accepted.includes(extension)) {
    throw new Error(`file_name extension must match output_format ${format}.`)
  }
  return fileName
}

export const resolveOutputPath = (
  root: string,
  directory: string,
  fileName: string,
  format: ImageFormat,
): string => {
  const outputDirectory = resolveInsideProject(root, directory, "directory")
  return resolveInsideProject(
    root,
    path.join(outputDirectory, outputFileName(fileName, format)),
    "file_name",
  )
}

export const versionedPath = (filePath: string, version: number): string => {
  const directory = path.dirname(filePath)
  const extension = path.extname(filePath)
  const stem = path.basename(filePath, extension)
  return path.join(directory, `${stem}-v${version}${extension}`)
}

export const writeUniqueFile = async (
  filePath: string,
  bytes: Uint8Array,
): Promise<{ savedPath: string; versioned: boolean }> => {
  await mkdir(path.dirname(filePath), { recursive: true })
  let candidate = filePath
  let version = 2
  for (;;) {
    try {
      await writeFile(candidate, bytes, { flag: "wx" })
      return { savedPath: candidate, versioned: candidate !== filePath }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "EEXIST") throw error
      candidate = versionedPath(filePath, version)
      version += 1
      if (!isInsideRoot(path.dirname(filePath), candidate)) {
        throw new Error(`Could not find a free output path near ${filePath}.`)
      }
    }
  }
}

export const mimeFromBytes = (bytes: Uint8Array): string => {
  if (bytes.length >= 4 && Buffer.from(bytes.subarray(0, 4)).equals(PNG)) return "image/png"
  if (bytes.length >= 3 && Buffer.from(bytes.subarray(0, 3)).equals(JPEG)) return "image/jpeg"
  if (bytes.length >= 4 && Buffer.from(bytes.subarray(0, 4)).equals(GIF)) return "image/gif"
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  ) {
    return "image/webp"
  }
  throw new Error("Input is not a PNG, JPEG, WebP, or GIF image.")
}

export const readReferenceImage = async (
  root: string,
  input: string,
): Promise<string> => {
  const absolute = resolveInsideProject(root, input, "images")
  const info = await stat(absolute)
  if (!info.isFile()) {
    throw new Error(`Reference image is not a file: ${input}`)
  }
  if (info.size > MAX_REFERENCE_BYTES) {
    throw new Error(`Reference image exceeds ${MAX_REFERENCE_BYTES} bytes: ${input}`)
  }
  const bytes = await readFile(absolute)
  const mime = mimeFromBytes(bytes)
  return `data:${mime};base64,${bytes.toString("base64")}`
}

export const mimeForFormat = mimeTypeFor
