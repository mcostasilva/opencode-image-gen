export const CONNECTOR_IDS = ["openai", "xai"] as const

export type ConnectorId = (typeof CONNECTOR_IDS)[number]

export interface PluginConfig {
  fallbackConnector?: ConnectorId
}

const isConnectorId = (value: string): value is ConnectorId =>
  (CONNECTOR_IDS as readonly string[]).includes(value)

export const parsePluginConfig = (options: Readonly<Record<string, unknown>>): PluginConfig => {
  const fallback = options.fallbackConnector
  if (fallback === undefined || fallback === null || fallback === false) {
    return {}
  }
  if (typeof fallback !== "string" || !isConnectorId(fallback)) {
    throw new Error(
      `fallbackConnector must be false or one of: ${CONNECTOR_IDS.join(", ")}.`,
    )
  }
  return { fallbackConnector: fallback }
}

export const connectorCandidates = (
  currentProvider: string | undefined,
  config: PluginConfig,
): ConnectorId[] => {
  const result: ConnectorId[] = []
  if (currentProvider && isConnectorId(currentProvider)) result.push(currentProvider)
  if (config.fallbackConnector && !result.includes(config.fallbackConnector)) {
    result.push(config.fallbackConnector)
  }
  return result
}
