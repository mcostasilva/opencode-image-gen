import { expect, test } from "bun:test"
import { connectorCandidates, parsePluginConfig } from "../src/config.ts"

test("fails over only when fallbackConnector is configured", () => {
  expect(connectorCandidates("anthropic", parsePluginConfig({}))).toEqual([])
  expect(
    connectorCandidates("anthropic", parsePluginConfig({ fallbackConnector: "openai" })),
  ).toEqual(["openai"])
})

test("uses the current provider before a fallback", () => {
  expect(connectorCandidates("openai", { fallbackConnector: "openai" })).toEqual(["openai"])
})

test("accepts false to require the current connector", () => {
  expect(parsePluginConfig({ fallbackConnector: false })).toEqual({})
})

test("rejects unknown fallback connectors", () => {
  expect(() => parsePluginConfig({ fallbackConnector: "unknown" })).toThrow(
    "fallbackConnector must be false or one of: openai",
  )
})
