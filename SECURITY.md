# Security policy

## Supported versions

Until the first stable release, security fixes are applied to the latest release and the `master` branch.

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub Security Advisories](https://github.com/mcostasilva/opencode-image-gen/security/advisories/new). Do not open a public issue for credential exposure, path traversal, or other security-sensitive findings.

Include the affected version, impact, and minimal reproduction details. Never include live OAuth tokens, API keys, or private image contents.

## Credential handling

The plugin resolves credentials through OpenCode's integration API. It does not read OpenCode's credential files directly and must never log or return OAuth tokens. The OpenAI connector sends the resolved token only to ChatGPT's Codex backend.

This plugin uses an unofficial endpoint that may change without notice. Review the source and OpenAI's policies before use.
