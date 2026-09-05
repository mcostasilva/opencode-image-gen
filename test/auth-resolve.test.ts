import { expect, test } from "bun:test"
import type { Context } from "@opencode-ai/plugin/promise/plugin"
import { resolveOpenAIOauth } from "../src/auth.ts"

const jwt = (accountId: string): string => {
  const payload = Buffer.from(
    JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
    "utf8",
  ).toString("base64url")
  return `header.${payload}.sig`
}

const fakeIntegration = (
  credential: unknown,
): Context["integration"] =>
  ({
    connection: {
      active: async () => (credential ? ({ id: "openai" } as never) : undefined),
      resolve: async () => credential as never,
    },
  }) as unknown as Context["integration"]

test("resolves ChatGPT OAuth credentials", async () => {
  const auth = await resolveOpenAIOauth(
    fakeIntegration({ type: "oauth", access: jwt("acct_9"), refresh: "r", expires: 1, methodID: "oauth" }),
  )
  expect(auth.accountId).toBe("acct_9")
  expect(auth.access.startsWith("header.")).toBe(true)
})

test("rejects a missing connection", async () => {
  await expect(resolveOpenAIOauth(fakeIntegration(undefined))).rejects.toThrow("No active OpenAI ChatGPT connection")
})

test("rejects an API key connection", async () => {
  await expect(resolveOpenAIOauth(fakeIntegration({ type: "key", key: "sk-test" }))).rejects.toThrow(
    "API key",
  )
})
