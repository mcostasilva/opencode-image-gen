# Contributing

Contributions are welcome through issues and pull requests.

## Development

Requirements:

- Bun 1.3.14 or newer
- OpenCode V2 for manual plugin testing

Install dependencies and run all checks:

```sh
bun install
bun run check
npm pack --dry-run
```

For local OpenCode testing, copy `opencode.example.jsonc` to `opencode.json`, replace the package path, and restart OpenCode. Do not commit local configuration, credentials, generated images, or OAuth tokens.

Keep changes focused and include tests for behavior changes. Any live-credential testing must remain optional; automated tests must use mocks.
