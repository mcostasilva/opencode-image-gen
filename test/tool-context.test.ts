import { afterEach, expect, test } from "bun:test"
import type { Context } from "@opencode-ai/plugin/promise/plugin"
import type { SessionContext } from "@opencode-ai/plugin/promise/session"
import type { Info, ToolContext } from "@opencode-ai/plugin/promise/tool"
import plugin from "../src/index.ts"
import { prepareImageTools } from "../src/tool-context.ts"
import { editImageInput, generateImageInput, parseImageToolInput } from "../src/schema.ts"
import { runImageTool } from "../src/run.ts"

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const oauth = {
  type: "oauth",
  access: `header.${Buffer.from(JSON.stringify({
    "https://api.openai.com/auth": { chatgpt_account_id: "account" },
  })).toString("base64url")}.signature`,
}
const key = { type: "key", key: "xai-test" }

const credentials = (values: Record<string, unknown>, attempts: string[] = []): Context["integration"] => ({
  connection: {
    active: async (id: string) => {
      attempts.push(id)
      return values[id] ? { id } : undefined
    },
    resolve: async (connection: { id: string }) => values[connection.id],
  },
}) as unknown as Context["integration"]

const context = (provider: string, sessionID = "session"): SessionContext => ({
  sessionID,
  agent: "build",
  model: { providerID: provider, id: "chat-model" },
  tools: {
    generate_image: { description: "Generate an image.", input: generateImageInput },
    edit_image: { description: "Edit an image.", input: editImageInput },
    execute: { description: "Run code.", input: { type: "object" } },
  },
  system: [],
  messages: [],
  generation: {},
  providerOptions: {},
}) as unknown as SessionContext

const schema = (event: SessionContext, tool = "generate_image") => event.tools[tool]!.input as {
  required: string[]
  additionalProperties: boolean
  properties: Record<string, { enum?: string[] }>
}

test("OpenAI requests expose only OpenAI arguments for both tools", async () => {
  const event = context("openai")
  const attempts: string[] = []
  await prepareImageTools(credentials({ openai: oauth, xai: key }, attempts), { fallbackConnector: "xai" }, event)
  expect(attempts).toEqual(["openai"])
  for (const name of ["generate_image", "edit_image"]) {
    const input = schema(event, name)
    expect(input.properties).not.toHaveProperty("aspect_ratio")
    expect(input.properties).not.toHaveProperty("resolution")
    expect(input.properties.background?.enum).toEqual(["auto", "opaque", "transparent"])
    expect(input.properties.quality?.enum).toContain("high")
    expect(input.properties.connector?.enum).toEqual(["openai"])
    expect(input.required).toContain("connector")
    expect(input.additionalProperties).toBe(false)
    expect(event.tools[name]!.description).toContain("gpt-image-2")
  }
  expect(event.tools.execute!.description).toBe("Run code.")
})

test("xAI requests expose native dimensions, restricted quality, and no background", async () => {
  const event = context("xai")
  await prepareImageTools(credentials({ openai: oauth, xai: key }), { fallbackConnector: "openai" }, event)
  for (const name of ["generate_image", "edit_image"]) {
    const input = schema(event, name)
    expect(input.properties.aspect_ratio?.enum).toContain("16:9")
    expect(input.properties.resolution?.enum).toEqual(["1k", "2k"])
    expect(input.properties.quality?.enum).toEqual(["auto", "low", "medium"])
    expect(input.properties).not.toHaveProperty("background")
    expect(input.properties.connector?.enum).toEqual(["xai"])
    expect(event.tools[name]!.description).toContain("grok-imagine-image-2.0")
  }
})

test("Grok OAuth stays on xAI with OpenAI fallback and resolves a fresh token at execution", async () => {
  const values: Record<string, unknown> = { xai: { type: "oauth", access: "old-token" }, openai: oauth }
  const attempts: string[] = []
  const integration = credentials(values, attempts)
  const event = context("xai")
  await prepareImageTools(integration, { fallbackConnector: "openai" }, event)
  expect(schema(event).properties.connector?.enum).toEqual(["xai"])
  expect(schema(event).properties).toHaveProperty("resolution")
  values.xai = { type: "oauth", access: "refreshed-token" }
  let requests = 0
  globalThis.fetch = (async (url, init) => {
    requests++
    expect(String(url)).toBe("https://api.x.ai/v1/images/generations")
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer refreshed-token")
    return new Response("private response", { status: 429 })
  }) as typeof fetch
  const ctx = {
    integration,
    session: { get: async () => ({ location: { directory: "/project" } }) },
  } as unknown as Context
  await expect(runImageTool(ctx, { sessionID: "session", progress: async () => {} } as unknown as ToolContext, "generate", {
    connector: schema(event).properties.connector!.enum![0], prompt: "test", directory: ".", file_name: "test.png",
  })).rejects.toThrow("xAI image request failed (429)")
  expect(requests).toBe(1)
  expect(attempts).toEqual(["xai", "xai"])
})

test("the fallback's schema is advertised when the preferred credentials are unavailable", async () => {
  for (const xai of [undefined, { type: "oauth", access: " " }]) {
    const event = context("xai")
    const attempts: string[] = []
    await prepareImageTools(credentials({ openai: oauth, xai }, attempts), { fallbackConnector: "openai" }, event)
    expect(attempts).toEqual(["xai", "openai"])
    expect(event.system).toContainEqual({ type: "text", text: expect.stringContaining("Using openai image fallback. Reason: No active xAI connection.") })
    expect(schema(event).properties.connector?.enum).toEqual(["openai"])
    expect(schema(event).properties).not.toHaveProperty("resolution")
  }
  const event = context("anthropic")
  await prepareImageTools(credentials({ xai: key }), { fallbackConnector: "xai" }, event)
  expect(schema(event).properties.connector?.enum).toEqual(["xai"])
})

test("unavailable image tools are removed without disrupting the other tools", async () => {
  const event = context("xai")
  await prepareImageTools(credentials({}), { fallbackConnector: "openai" }, event)
  expect(Object.keys(event.tools)).toEqual(["execute"])
  expect(event.system).toEqual([expect.objectContaining({ text: expect.stringContaining("Image tools are unavailable") })])

  const noFallback = context("anthropic")
  const attempts: string[] = []
  await prepareImageTools(credentials({ openai: oauth }, attempts), {}, noFallback)
  expect(attempts).toEqual([])
  expect(Object.keys(noFallback.tools)).toEqual(["execute"])
})

test("permission-filtered tools are not reintroduced and resolution errors reach the model", async () => {
  const event = context("xai")
  delete event.tools.edit_image
  await prepareImageTools(credentials({ xai: key }), {}, event)
  expect(event.tools).not.toHaveProperty("edit_image")
  delete event.tools.generate_image
  const attempts: string[] = []
  await prepareImageTools(credentials({}, attempts), {}, event)
  expect(attempts).toEqual([])

  const failed = context("xai")
  const integration = { connection: { active: async () => { throw new Error("private-credential") } } } as unknown as Context["integration"]
  await prepareImageTools(integration, {}, failed)
  expect(Object.keys(failed.tools)).toEqual(["execute"])
  expect(JSON.stringify(failed.system)).toContain("private-credential")
})

test("parallel sessions and model switches get independent schemas", async () => {
  const openai = context("openai", "session-a")
  const xai = context("xai", "session-b")
  const integration = credentials({ openai: oauth, xai: key })
  const registered = JSON.stringify([generateImageInput, editImageInput])
  await Promise.all([
    prepareImageTools(integration, {}, openai),
    prepareImageTools(integration, {}, xai),
  ])
  expect(schema(openai).properties.connector?.enum).toEqual(["openai"])
  expect(schema(xai).properties.connector?.enum).toEqual(["xai"])
  const switched = context("xai", "session-a")
  await prepareImageTools(integration, {}, switched)
  expect(schema(switched).properties.connector?.enum).toEqual(["xai"])
  schema(switched).properties.size!.enum!.push("bad-size")
  schema(switched).required.push("bad-field")
  expect(schema(xai).properties.size!.enum).not.toContain("bad-size")
  expect(JSON.stringify([generateImageInput, editImageInput])).toBe(registered)
})

test("runtime rejects incompatible and unknown arguments even when manually constructed", async () => {
  let fetches = 0
  globalThis.fetch = (async () => { fetches++; throw new Error("Unexpected API call") }) as unknown as typeof fetch
  const base = { prompt: "test", directory: ".", file_name: "test.png" }
  const ctx = {} as Context
  const tool = {} as ToolContext
  for (const fields of [
    { connector: "openai", aspect_ratio: "16:9" },
    { connector: "openai", resolution: "2k" },
    { connector: "openai", resolution: undefined },
    { connector: "xai", quality: "high" },
    { connector: "xai", background: "auto" },
    { connector: "openai", invented: true },
    { connector: "xai", images: ["source.png"] },
    { connector: "invalid" },
    {},
  ]) {
    await expect(runImageTool(ctx, tool, "generate", { ...base, ...fields })).rejects.toThrow()
  }
  expect(fetches).toBe(0)
  expect(parseImageToolInput({ ...base, connector: "xai", aspect_ratio: "16:9", resolution: "2k" }, "generate").options).toMatchObject({ aspectRatio: "16:9", resolution: "2k", background: "auto" })
})

test("credential changes cannot send a pinned xAI call to OpenAI; the next request can fallback", async () => {
  const available: Record<string, unknown> = { xai: key, openai: oauth }
  const attempts: string[] = []
  const integration = credentials(available, attempts)
  const advertised = context("xai")
  await prepareImageTools(integration, { fallbackConnector: "openai" }, advertised)
  const connector = schema(advertised).properties.connector!.enum![0]
  delete available.xai
  attempts.length = 0
  const ctx = {
    integration,
    session: { get: async () => ({ location: { directory: "/project" } }) },
  } as unknown as Context
  await expect(runImageTool(ctx, { sessionID: "session" } as ToolContext, "generate", {
    connector, prompt: "test", directory: ".", file_name: "test.png", aspect_ratio: "16:9",
  })).rejects.toThrow("Retry using the refreshed tool schema")
  expect(attempts).toEqual(["xai"])
  const next = context("xai")
  await prepareImageTools(integration, { fallbackConnector: "openai" }, next)
  expect(schema(next).properties.connector?.enum).toEqual(["openai"])
  expect(schema(next).properties).not.toHaveProperty("aspect_ratio")
})

test("plugin registers direct image tools and narrows them through the actual context hook", async () => {
  const tools: Info[] = []
  let hook: ((event: SessionContext) => Promise<void>) | undefined
  const ctx = {
    options: { fallbackConnector: "openai" },
    integration: credentials({ openai: oauth }),
    tool: { transform: async (callback: (editor: { add: (tool: Info) => void }) => void) => callback({ add: (tool) => { tools.push(tool) } }) },
    session: { hook: async (name: string, callback: typeof hook) => { expect(name).toBe("context"); hook = callback } },
  } as unknown as Context
  await plugin.setup(ctx)
  expect(tools.map((tool) => tool.name)).toEqual(["generate_image", "edit_image"])
  // OpenCode partitions Code Mode inventory using this flag before context hooks.
  expect(tools.filter((tool) => tool.options?.codemode !== false)).toEqual([])
  const event = context("xai")
  event.tools = Object.fromEntries(tools.map((tool) => [tool.name, { description: tool.description, input: tool.input }])) as SessionContext["tools"]
  await hook!(event)
  expect(schema(event).properties.connector?.enum).toEqual(["openai"])
  expect(schema(event).properties).not.toHaveProperty("aspect_ratio")
})
