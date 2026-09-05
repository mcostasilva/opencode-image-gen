export class ConnectorUnavailableError extends Error {
  readonly connector: string

  constructor(connector: string, message: string) {
    super(message)
    this.name = "ConnectorUnavailableError"
    this.connector = connector
  }
}
