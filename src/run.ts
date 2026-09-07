import type { Context } from "@opencode-ai/plugin/promise/plugin"
import type { Result, ToolContext } from "@opencode-ai/plugin/promise/tool"
import path from "node:path"
import { resolveConnector } from "./connectors.ts"
import { ConnectorUnavailableError } from "./errors.ts"
import {
  mimeForFormat,
  readReferenceImage,
  resolveOutputPath,
  writeUniqueFile,
} from "./paths.ts"
import { parseImageToolInput } from "./schema.ts"
import type { ImageAction } from "./types.ts"

export const runImageTool = async (
  ctx: Context,
  tool: ToolContext,
  action: ImageAction,
  input: unknown,
): Promise<Result> => {
  const { connector: selected, options } = parseImageToolInput(input, action)
  const session = await ctx.session.get({ sessionID: tool.sessionID })
  const root = session.location.directory
  // Validate the destination before making a billable generation request.
  const outputPath = resolveOutputPath(root, options.directory, options.fileName, options.outputFormat)
  // Use the connector advertised for this request, not a newly selected fallback.
  // The next model request will resolve fallback again with its matching schema.
  const connector = await resolveConnector(ctx.integration, selected).catch((error) => {
    if (!(error instanceof ConnectorUnavailableError)) throw error
    throw new Error(`The selected ${selected} image connection is no longer available. Retry using the refreshed tool schema. ${error.message}`)
  })

  await tool.progress({
    status: action === "edit" ? "editing" : "generating",
    message:
      action === "edit"
        ? `Editing image with ${connector.id} (${connector.model})`
        : `Generating image with ${connector.id} (${connector.model})`,
  })

  const references = await Promise.all(options.images.map((image) => readReferenceImage(root, image)))
  const requestId = crypto.randomUUID()
  const generated = await connector.generate({
    options,
    action,
    imageDataUrls: references,
    requestId,
  })
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

  if (image.format && image.format !== options.outputFormat) {
    throw new Error("The image connector returned an unexpected output format.")
  }
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
      billing: generated.billing,
      versioned,
      action,
    },
  }
}
