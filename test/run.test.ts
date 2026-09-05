import { afterEach, expect, test } from "bun:test"
import type { Context } from "@opencode-ai/plugin/promise/plugin"
import type { ToolContext } from "@opencode-ai/plugin/promise/tool"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { runImageTool } from "../src/run.ts"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const accessToken = (): string => {
  const payload = Buffer.from(
    JSON.stringify({
      "https://api.openai.com/auth": { chatgpt_account_id: "acct_test" },
    }),
  ).toString("base64url")
  return `header.${payload}.signature`
}

test("uses the fallback connector and writes inside the session working directory", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "opencode-image-gen-"))
  const image = Buffer.from("generated image")
  const event = {
    type: "response.output_item.done",
    item: {
      type: "image_generation_call",
      id: "ig_local",
      result: image.toString("base64"),
    },
  }

  globalThis.fetch = (async () =>
    new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    })) as unknown as typeof fetch

  const ctx = {
    session: {
      get: async () => ({
        location: { directory: project },
        model: { providerID: "anthropic", id: "claude" },
      }),
    },
    integration: {
      connection: {
        active: async () => ({ id: "openai" }),
        resolve: async () => ({ type: "oauth", access: accessToken() }),
      },
    },
  } as unknown as Context
  const tool = {
    sessionID: "session_test",
    progress: async () => {},
  } as unknown as ToolContext

  const result = await runImageTool(
    ctx,
    tool,
    { fallbackConnector: "openai" },
    "generate",
    { prompt: "a test image", directory: "generated", file_name: "result.png" },
  )

  expect(result.output).toBeUndefined()
  expect(result.metadata?.connector).toBe("openai")
  expect(result.metadata?.savedPath).toBe(path.join(project, "generated", "result.png"))
  expect(await readFile(path.join(project, "generated", "result.png"))).toEqual(image)
})
