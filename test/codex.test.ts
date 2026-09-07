import { expect, test } from "bun:test"
import { buildCodexRequest, parseCodexImageResponse } from "../src/codex.ts"
import type { ImageOptions } from "../src/types.ts"

const options: ImageOptions = {
  prompt: "a red cube",
  size: "1024x1024",
  quality: "medium",
  background: "opaque",
  outputFormat: "png",
  directory: ".",
  fileName: "cube.png",
  images: [],
}

const sse = (events: unknown[]): string =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n"

test("builds a generate request without input images", () => {
  const request = buildCodexRequest(options, "generate", [], "session-1")
  expect(request.model).toBe("gpt-5.5")
  expect(request.tools[0]?.model).toBe("gpt-image-2")
  expect(request.tool_choice).toEqual({ type: "image_generation" })
  expect(request.input[0]?.content).toEqual([{ type: "input_text", text: "Generate this image: a red cube" }])
})

test("builds an edit request with input images", () => {
  const request = buildCodexRequest(
    { ...options, prompt: "make it night" },
    "edit",
    ["data:image/png;base64,aaa"],
    "session-2",
  )
  expect(request.input[0]?.content).toEqual([
    { type: "input_text", text: "Edit the provided image(s): make it night" },
    { type: "input_image", image_url: "data:image/png;base64,aaa" },
  ])
})

test("parses an image_generation_call SSE result", () => {
  const body = sse([
    { type: "response.created" },
    {
      type: "response.output_item.done",
      item: {
        type: "image_generation_call",
        id: "ig_1",
        result: "aGVsbG8=",
        revised_prompt: "A red cube on a table",
      },
    },
  ])
  expect(parseCodexImageResponse(body)).toEqual({
    id: "ig_1",
    base64: "aGVsbG8=",
    revisedPrompt: "A red cube on a table",
  })
})

test("surfaces Codex error events", () => {
  const body = sse([{ type: "error", message: "rate limited" }])
  expect(() => parseCodexImageResponse(body)).toThrow("rate limited")
})

test("fails when no image is returned", () => {
  const body = sse([{ type: "response.completed" }])
  expect(() => parseCodexImageResponse(body)).toThrow("no image generation result")
})

test("preserves refusal details alongside an empty image result", () => {
  const body = sse([
    { type: "response.output_item.done", item: { type: "image_generation_call", id: "ig_blocked", result: "", status: "failed", error: { code: "content_policy_violation", message: "Provider rejection details" } } },
    { type: "response.completed", response: { output: [{ type: "message", content: [{ type: "refusal", refusal: "Upstream refusal text" }] }] } },
  ])
  expect(() => parseCodexImageResponse(body)).toThrow(body)
})

test("preserves message-only refusals and incomplete response details", () => {
  for (const event of [
    { type: "response.completed", response: { output: [{ type: "message", content: [{ type: "refusal", refusal: "Provider refusal" }] }] } },
    { type: "response.incomplete", response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } },
    { type: "response.failed", response: { error: { code: "upstream_code", message: "Original message" } } },
  ]) {
    const body = sse([event])
    expect(() => parseCodexImageResponse(body)).toThrow(body)
  }
})

test("reads the image from completed response output when item events omit data", () => {
  const body = sse([
    { type: "response.output_item.done", item: { type: "image_generation_call", id: "ig_1", result: "" } },
    { type: "response.completed", response: { output: [{ type: "image_generation_call", id: "ig_1", result: "aGVsbG8=" }] } },
  ])
  expect(parseCodexImageResponse(body)).toMatchObject({ id: "ig_1", base64: "aGVsbG8=" })
})

test("preserves unexpected non-SSE response bodies", () => {
  const body = JSON.stringify({ error: { code: "unexpected_response", message: "Original upstream detail" } })
  expect(() => parseCodexImageResponse(body)).toThrow(body)
})
