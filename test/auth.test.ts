import { expect, test } from "bun:test"
import { accountIdFromAccessToken } from "../src/auth.ts"

const jwt = (payload: unknown): string => {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `header.${encoded}.sig`
}

test("reads chatgpt_account_id from the OpenAI auth claim", () => {
  const token = jwt({
    "https://api.openai.com/auth": { chatgpt_account_id: "acct_123" },
  })
  expect(accountIdFromAccessToken(token)).toBe("acct_123")
})

test("rejects a non-JWT", () => {
  expect(() => accountIdFromAccessToken("not-a-jwt")).toThrow("not a JWT")
})

test("rejects a token without an account id", () => {
  const token = jwt({ sub: "user" })
  expect(() => accountIdFromAccessToken(token)).toThrow("no ChatGPT account identifier")
})
