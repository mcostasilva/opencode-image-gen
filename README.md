# opencode-image-gen

[![CI](https://github.com/mcostasilva/opencode-image-gen/actions/workflows/ci.yml/badge.svg)](https://github.com/mcostasilva/opencode-image-gen/actions/workflows/ci.yml)

OpenCode V2 plugin that adds `generate_image` and `edit_image` tools. Both reuse the **ChatGPT/Codex OAuth** connection you already configured with `/connect`. There is no separate OpenAI API key; usage counts against the connected ChatGPT plan.

## Requirements

- OpenCode V2 (`opencode2`)
- An active OpenAI connection signed in with **ChatGPT** (Plus / Pro / Business), not a platform API key
- A ChatGPT plan that includes Codex image generation

## Install from GitHub

Add the GitHub package to `plugins` in `~/.config/opencode/opencode.jsonc` or a project `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:mcostasilva/opencode-image-gen",
      "options": {
        "fallbackConnector": "openai",
      },
    },
  ],
}
```

The package is not yet published to npm. After it is published, `"opencode-image-gen"` can be used as the package value.

For local development, clone the repository and point OpenCode at its absolute directory:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-image-gen",
      "options": {
        "fallbackConnector": "openai",
      },
    },
  ],
}
```

Restart OpenCode after changing plugins. If OpenAI is not connected yet:

```text
/connect
```

Choose OpenAI and sign in with ChatGPT.

## Connector selection

The plugin first checks the provider used by the current OpenCode session. If that provider has an image connector, it is used. Only the `openai` connector is implemented today.

Set `fallbackConnector` to use another configured connector when the current provider cannot generate images:

```jsonc
{
  "plugins": [
    {
      "package": "opencode-image-gen",
      "options": { "fallbackConnector": "openai" },
    },
  ],
}
```

Omit the option or set it to `false` to fail instead of falling back:

```jsonc
"options": { "fallbackConnector": false }
```

The OpenAI connector requires an active ChatGPT OAuth connection. API-key credentials are rejected with guidance to use `/connect`.

## Tools

Ask any agent in natural language. It will pick the matching tool.

### `generate_image`

Generates a brand-new image from text through the configured AI image-generation connector. It does not accept source images and does not perform local image processing.

| Argument | Values | Default |
| --- | --- | --- |
| `prompt` | Image description | required |
| `size` | `auto`, `1024x1024`, `1536x1024`, `1024x1536` | `auto` |
| `quality` | `auto`, `low`, `medium`, `high` | `auto` |
| `background` | `auto`, `opaque`, `transparent` | `auto` |
| `output_format` | `png`, `webp`, `jpeg` | `png` |
| `directory` | Directory relative to the session working directory; use `.` for the working directory | required |
| `file_name` | Filename only; extension must match `output_format` | required |

### `edit_image`

Reference-guided **generation**. It sends local images to the configured AI connector and creates a separate output image. It never modifies the reference files locally. Do not use it for deterministic operations such as cropping, resizing, rotating, compression, or format conversion.

It accepts the same fields as `generate_image`, plus:

| Argument | Values | Default |
| --- | --- | --- |
| `images` | One to five project-local image paths | required |

Directories and reference paths resolve from the active session's working directory. Absolute directories and reference paths are allowed only if they stay inside that working directory. `file_name` cannot contain a directory. Existing outputs are never overwritten; the plugin writes `name-v2.png`, `name-v3.png`, and so on.

## How it works

1. The plugin reads the active session provider and working directory from OpenCode.
2. It selects that provider's image connector or the configured fallback connector.
3. The OpenAI connector resolves the active connection through `ctx.integration.connection`; only ChatGPT OAuth is accepted.
4. It sends a Responses request to ChatGPT's Codex backend with the hosted `image_generation` tool (`gpt-image-2`).
5. The returned image is written inside the session working directory and returned as OpenCode file content so the model can inspect it.

The access token is used only for that request. It is never logged or included in tool output.

## Limitations

- This is an unofficial third-party plugin, not affiliated with OpenAI or OpenCode.
- Subscription image generation uses the undocumented Codex endpoint OpenCode already uses for ChatGPT chat (`https://chatgpt.com/backend-api/codex/responses`). It can change without notice.
- Pixel-precise mask inpainting is not supported on the OAuth path.
- Image availability and usage limits depend on the connected ChatGPT account.

Use must comply with OpenAI's [Terms of Use](https://openai.com/policies/row-terms-of-use/) and [Usage Policies](https://openai.com/policies/usage-policies/).

## Development

```sh
bun install
bun run check
npm pack --dry-run
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for local plugin setup and contribution guidelines.
