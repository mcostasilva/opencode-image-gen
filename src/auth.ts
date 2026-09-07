import type { Context } from "@opencode-ai/plugin/promise/plugin"
import { ConnectorUnavailableError } from "./errors.ts"
import type { CodexAuth } from "./types.ts"

const ACCOUNT_CLAIM = "https://api.openai.com/auth"

export const resolveXaiAuth = async (integration: Context["integration"]): Promise<{
  bearer: string
  billing: "subscription" | "api"
}> => {
  const connection = await integration.connection.active("xai")
  const credential = connection ? await integration.connection.resolve(connection) : undefined
  if (credential?.type === "oauth" && credential.access.trim()) {
    return { bearer: credential.access, billing: "subscription" }
  }
  if (credential?.type === "key" && credential.key.trim()) {
    return { bearer: credential.key, billing: "api" }
  }
  throw new ConnectorUnavailableError(
    "xai",
    "No active xAI connection. In OpenCode, run /connect and connect xAI with your SuperGrok subscription or an API key.",
  )
}

const CONNECT_HINT =
  "No active OpenAI ChatGPT connection. In OpenCode, run /connect and sign in with ChatGPT."

const API_KEY_HINT =
  "The active OpenAI connection is an API key. This plugin only supports ChatGPT subscription OAuth. Run /connect and sign in with ChatGPT."

export const accountIdFromAccessToken = (access: string): string => {
  const payload = access.split(".")[1]
  if (!payload) {
    throw new Error("The OpenAI OAuth access token is not a JWT.")
  }

  let decoded: string
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8")
  } catch {
    throw new Error("The OpenAI OAuth token payload is not valid base64url.")
  }

  let claims: unknown
  try {
    claims = JSON.parse(decoded)
  } catch {
    throw new Error("The OpenAI OAuth token payload is not valid JSON.")
  }

  if (claims === null || typeof claims !== "object") {
    throw new Error("The OpenAI OAuth token payload is invalid.")
  }

  const auth = (claims as Record<string, unknown>)[ACCOUNT_CLAIM]
  if (auth === null || typeof auth !== "object") {
    throw new Error("The OpenAI OAuth token has no ChatGPT account identifier.")
  }

  const accountId = (auth as Record<string, unknown>).chatgpt_account_id
  if (typeof accountId !== "string" || accountId.trim() === "") {
    throw new Error("The OpenAI OAuth token has no ChatGPT account identifier.")
  }

  return accountId
}

export const resolveOpenAIOauth = async (
  integration: Context["integration"],
): Promise<CodexAuth> => {
  const connection = await integration.connection.active("openai")
  if (!connection) {
    throw new ConnectorUnavailableError("openai", CONNECT_HINT)
  }

  const credential = await integration.connection.resolve(connection)
  if (!credential) {
    throw new ConnectorUnavailableError("openai", CONNECT_HINT)
  }
  if (credential.type !== "oauth") {
    throw new ConnectorUnavailableError("openai", API_KEY_HINT)
  }

  let accountId: string
  try {
    accountId = accountIdFromAccessToken(credential.access)
  } catch (error) {
    const message = error instanceof Error ? error.message : "The OpenAI OAuth token is invalid."
    throw new ConnectorUnavailableError("openai", message)
  }

  return {
    access: credential.access,
    accountId,
  }
}
