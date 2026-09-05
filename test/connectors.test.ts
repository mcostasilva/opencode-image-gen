import { expect, test } from "bun:test"
import type { Context } from "@opencode-ai/plugin/promise/plugin"
import { generateWithConnector } from "../src/connectors.ts"
import type { ImageOptions } from "../src/types.ts"

const options: ImageOptions = {
  prompt: "a test image",
  size: "auto",
  quality: "auto",
  background: "auto",
  outputFormat: "png",
  directory: ".",
  fileName: "test.png",
  images: [],
}

test("fails when the current provider is unsupported and no fallback is configured", async () => {
  await expect(
    generateWithConnector(
      {} as Context,
      {},
      "anthropic",
      options,
      "generate",
      [],
      "request_test",
    ),
  ).rejects.toThrow("Configure fallbackConnector")
})
