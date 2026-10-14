import type { Plugin } from "@opencode-ai/plugin/promise/plugin"
import { parsePluginConfig } from "./config.ts"
import { editImageInput, generateImageInput } from "./schema.ts"
import { runImageTool } from "./run.ts"
import { prepareImageTools } from "./tool-context.ts"

// Keep SDK imports type-only: the host supplies its own Effect runtime.
export default {
  id: "opencode-image-gen",
  async setup(ctx) {
    const config = parsePluginConfig(ctx.options)
    await ctx.tool.transform((tools) => {
      tools.add({
        name: "generate_image",
        description:
          "Generate a brand-new raster image from a text prompt through the configured AI image-generation connector. This is generative AI, not local image processing. It accepts no source images; use edit_image for reference-guided generation. Set directory and file_name separately. The new output stays inside the session working directory and is returned as file content.",
        input: generateImageInput,
        options: { codemode: false },
        execute: async (input, tool) => runImageTool(ctx, tool, "generate", input),
      })

      tools.add({
        name: "edit_image",
        description:
          "Generate a new raster image through the configured AI image-generation connector, guided by a prompt and one to five local reference images. The reference files are uploaded to the connector and never modified; the result is saved as a separate file. Do not use this tool for local or deterministic operations such as crop, resize, rotate, compress, or format conversion. Set directory and file_name separately; output stays inside the session working directory and is returned as file content.",
        input: editImageInput,
        options: { codemode: false },
        execute: async (input, tool) => runImageTool(ctx, tool, "edit", input),
      })
    })
    await ctx.session.hook("context", (event) => prepareImageTools(ctx.integration, config, event))
  },
} satisfies Plugin
