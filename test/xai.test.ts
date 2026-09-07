import { afterEach, expect, test } from "bun:test"
import type { Context } from "@opencode-ai/plugin/promise/plugin"
import type { ToolContext } from "@opencode-ai/plugin/promise/tool"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import sharp from "sharp"
import { resolveXaiAuth } from "../src/auth.ts"
import { connectorCandidates, parsePluginConfig } from "../src/config.ts"
import { generateWithConnector } from "../src/connectors.ts"
import { runImageTool } from "../src/run.ts"
import { parseImageOptions } from "../src/schema.ts"
import { buildXaiRequest, parseXaiImageResponse, XAI_IMAGE_MODEL } from "../src/xai.ts"

const originalFetch = globalThis.fetch
const directories: string[] = []
afterEach(async () => {
  globalThis.fetch = originalFetch
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const options = parseImageOptions({ prompt: "a lighthouse", directory: ".", file_name: "image.png" }, "generate")
const integration = (credential: unknown): Context["integration"] => ({
  connection: {
    active: async () => credential ? { id: "test" } : undefined,
    resolve: async () => credential,
  },
}) as unknown as Context["integration"]
const jpeg = () => sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } }).jpeg().toBuffer()

test("resolves xAI OAuth and keys and rejects missing or empty credentials", async () => {
  expect(await resolveXaiAuth(integration({ type: "key", key: "xai-test" }))).toEqual({ bearer: "xai-test", billing: "api" })
  expect(await resolveXaiAuth(integration({ type: "oauth", access: "token" }))).toEqual({ bearer: "token", billing: "subscription" })
  for (const credential of [undefined, { type: "key", key: " " }, { type: "oauth", access: " " }]) {
    await expect(resolveXaiAuth(integration(credential))).rejects.toThrow("No active xAI connection")
  }
})

test("selects xAI by session or fallback without duplicates", () => {
  const config = parsePluginConfig({ fallbackConnector: "xai" })
  expect(connectorCandidates("xai", config)).toEqual(["xai"])
  expect(connectorCandidates("anthropic", config)).toEqual(["xai"])
  expect(connectorCandidates("openai", config)).toEqual(["openai", "xai"])
})

test("builds JSON generation and mutually exclusive single/multi-image edits", () => {
  const url = "data:image/png;base64,YQ=="
  const request = buildXaiRequest({ ...options, size: "1536x1024", quality: "medium", resolution: "2k" }, "generate", [])
  expect(request).toMatchObject({ model: XAI_IMAGE_MODEL, n: 1, response_format: "b64_json", aspect_ratio: "3:2", resolution: "2k", quality: "medium" })
  expect(buildXaiRequest(options, "generate", []).aspect_ratio).toBeUndefined()
  const single = buildXaiRequest(options, "edit", [url])
  expect(single.image).toEqual({ url })
  expect(single.images).toBeUndefined()
  const multi = buildXaiRequest(options, "edit", Array(5).fill(url))
  expect(multi.images).toHaveLength(5)
  expect(multi.image).toBeUndefined()
  expect(() => buildXaiRequest(options, "edit", [])).toThrow("one to five")
  expect(() => buildXaiRequest(options, "edit", Array(6).fill(url))).toThrow("one to five")
  expect(() => buildXaiRequest(options, "edit", ["data:image/gif;base64,YQ=="])).toThrow("PNG, JPEG, or WebP")
})

test("parses native xAI dimensions and rejects invalid or conflicting values", () => {
  const input = { prompt: "x", directory: ".", file_name: "x.png", aspect_ratio: "16:9", resolution: "2k" }
  expect(parseImageOptions(input, "generate")).toMatchObject({ aspectRatio: "16:9", resolution: "2k" })
  expect(() => parseImageOptions({ ...input, size: "1024x1024" }, "generate")).toThrow("cannot be combined")
  expect(() => parseImageOptions({ ...input, resolution: "4k" }, "generate")).toThrow("resolution")
  expect(() => parseImageOptions({ ...input, aspect_ratio: "7:7" }, "generate")).toThrow("aspect_ratio")
})

test("normalizes real JPEG bytes to the requested format and preserves dimensions", async () => {
  const bytes = await jpeg()
  for (const format of ["png", "webp", "jpeg"] as const) {
    const image = await parseXaiImageResponse({ data: [{ b64_json: bytes.toString("base64"), mime_type: "image/jpeg" }] }, format, "request")
    expect(image.format).toBe(format)
    expect(await sharp(Buffer.from(image.base64, "base64")).metadata()).toMatchObject({ format, width: 8, height: 6 })
    if (format === "jpeg") expect(Buffer.from(image.base64, "base64")).toEqual(bytes)
  }
  await expect(parseXaiImageResponse({ data: [{ b64_json: bytes.toString("base64"), mime_type: "image/png" }] }, "png", "id")).rejects.toThrow("MIME")
})

test("rejects malformed, missing, and filtered image responses", async () => {
  for (const response of [null, {}, { data: [] }, { data: [{ b64_json: "!!!!" }] }, { data: [{ b64_json: "" }] }]) {
    await expect(parseXaiImageResponse(response, "png", "id")).rejects.toThrow("base64")
  }
  await expect(parseXaiImageResponse({ data: [{ respect_moderation: false }] }, "png", "id")).rejects.toThrow("filtered")
  await expect(parseXaiImageResponse({ data: [{ b64_json: Buffer.from("not an image").toString("base64") }] }, "png", "id")).rejects.toThrow("not a PNG")
})

test("rejects unsupported options before fetching, without falling back", async () => {
  let calls = 0
  globalThis.fetch = (async () => { calls++; throw new Error("unexpected fetch") }) as unknown as typeof fetch
  const ctx = { integration: integration({ type: "key", key: "xai-test" }) } as Context
  for (const invalid of [{ quality: "high" }, { background: "transparent" }, { background: "opaque" }] as const) {
    await expect(generateWithConnector(ctx, { fallbackConnector: "openai" }, "xai", { ...options, ...invalid }, "generate", [], "id")).rejects.toThrow("xAI supports")
  }
  expect(calls).toBe(0)
})

test("returns the actual API error body without falling back", async () => {
  let calls = 0
  const body = JSON.stringify({ error: { code: "rate_limit_exceeded", message: "Upstream detail " + "x".repeat(600) } })
  globalThis.fetch = (async () => { calls++; return new Response(body, { status: 429 }) }) as unknown as typeof fetch
  const ctx = { integration: integration({ type: "key", key: "xai-test" }) } as Context
  await expect(generateWithConnector(ctx, { fallbackConnector: "openai" }, "xai", options, "generate", [], "id")).rejects.toThrow(`xAI image request failed (429): ${body}`)
  expect(calls).toBe(1)
})

test.each(["api", "subscription"] as const)("runs xAI generation and editing with %s credentials", async (billing) => {
  const root = await mkdtemp(path.join(tmpdir(), "xai-image-test-"))
  directories.push(root)
  const bytes = await jpeg()
  await writeFile(path.join(root, "reference.jpg"), bytes)
  const requests: Array<{ url: string; body: Record<string, unknown> }> = []
  globalThis.fetch = (async (url, init) => {
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer xai-test")
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    return Response.json({ data: [{ b64_json: bytes.toString("base64"), mime_type: "image/jpeg" }] })
  }) as typeof fetch
  const ctx = {
    session: { get: async () => ({ location: { directory: root }, model: { providerID: "openai" } }) },
    integration: { connection: {
      active: async (id: string) => id === "xai" ? { id } : undefined,
      resolve: async () => billing === "api"
        ? { type: "key", key: "xai-test" }
        : { type: "oauth", access: "xai-test" },
    } },
  } as unknown as Context
  const tool = { sessionID: "test", progress: async () => {} } as unknown as ToolContext
  for (const action of ["generate", "edit"] as const) {
    const result = await runImageTool(ctx, tool, action, {
      connector: "xai", prompt: "a lighthouse", directory: ".", file_name: "image.png",
      ...(action === "edit" ? { images: ["reference.jpg"] } : {}),
    })
    expect(result.metadata).toMatchObject({ connector: "xai", billing, model: XAI_IMAGE_MODEL, action, versioned: action === "edit" })
    const output = await readFile(String(result.metadata?.savedPath))
    expect(await sharp(output).metadata()).toMatchObject({ format: "png" })
    expect(result.content).toContainEqual(expect.objectContaining({ type: "file", mime: "image/png", uri: `data:image/png;base64,${output.toString("base64")}` }))
  }
  expect(requests[0]?.url).toEndWith("/generations")
  expect(requests[1]?.url).toEndWith("/edits")
  expect(requests[1]?.body.image).toEqual({ url: `data:image/jpeg;base64,${bytes.toString("base64")}` })
  expect(await readFile(path.join(root, "reference.jpg"))).toEqual(bytes)
  await expect(runImageTool(ctx, tool, "generate", {
    connector: "xai", prompt: "x", directory: ".", file_name: "bad.jpg", output_format: "png",
  })).rejects.toThrow("extension must match")
  expect(requests).toHaveLength(2)
})
