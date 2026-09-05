import type { Context } from "@opencode-ai/plugin/promise/plugin"
import type { Result, ToolContext } from "@opencode-ai/plugin/promise/tool"
import path from "node:path"
import type { PluginConfig } from "./config.ts"
import { generateWithConnector } from "./connectors.ts"
import {
  mimeForFormat,
  readReferenceImage,
  resolveOutputPath,
  writeUniqueFile,
} from "./paths.ts"
import { parseImageOptions } from "./schema.ts"
import type { ImageAction } from "./types.ts"

export const runImageTool = async (
  ctx: Context,
  tool: ToolContext,
  config: PluginConfig,
  action: ImageAction,
  input: unknown,
): Promise<Result> => {
  const options = parseImageOptions(input, action)
  const session = await ctx.session.get({ sessionID: tool.sessionID })
  const root = session.location.directory

  await tool.progress({
    status: action === "edit" ? "editing" : "generating",
    message:
      action === "edit"
        ? "Editing image with the selected image connector"
        : "Generating image with the selected image connector",
  })

  const references = await Promise.all(options.images.map((image) => readReferenceImage(root, image)))
  const requestId = crypto.randomUUID()
  const generated = await generateWithConnector(
    ctx,
    config,
    session.model?.providerID,
    options,
    action,
    references,
    requestId,
  )
  const { image } = generated

  let bytes: Buffer
  try {
    bytes = Buffer.from(image.base64, "base64")
  } catch {
    throw new Error("The image connector returned invalid base64 image data.")
  }
  if (bytes.length === 0) {
    throw new Error("The image connector returned empty image data.")
  }

  const outputPath = resolveOutputPath(
    root,
    options.directory,
    options.fileName,
    options.outputFormat,
  )
  const { savedPath, versioned } = await writeUniqueFile(outputPath, bytes)
  const mimeType = mimeForFormat(options.outputFormat)
  const text = versioned
    ? `${action === "edit" ? "Edited" : "Generated"} image saved to ${savedPath} (${path.basename(outputPath)} already existed).`
    : `${action === "edit" ? "Edited" : "Generated"} image saved to ${savedPath}`

  return {
    content: [
      { type: "text", text },
      {
        type: "file",
        uri: `data:${mimeType};base64,${image.base64}`,
        mime: mimeType,
        name: path.basename(savedPath),
      },
    ],
    metadata: {
      imageId: image.id,
      savedPath,
      connector: generated.connector,
      model: generated.model,
      billing: "subscription",
      versioned,
      action,
    },
  }
}
