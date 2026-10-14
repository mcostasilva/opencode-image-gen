# opencode-image-gen

[![CI](https://github.com/mcostasilva/opencode-image-gen/actions/workflows/ci.yml/badge.svg)](https://github.com/mcostasilva/opencode-image-gen/actions/workflows/ci.yml)

OpenCode V2 plugin that adds `generate_image` and `edit_image` tools through **OpenAI GPT Image** or **xAI Grok Imagine**. Both reuse connections configured with `/connect`.

| Connector | Model | Authentication | Billing |
| --- | --- | --- | --- |
| `openai` | `gpt-image-2` | ChatGPT/Codex OAuth | Connected ChatGPT subscription |
| `xai` | `grok-imagine-image-2.0` | SuperGrok OAuth or xAI API key | Connected subscription or API credits, according to the credential type |

## Requirements

- OpenCode V2 (`opencode2`)
- At least one supported connection:
  - **OpenAI:** ChatGPT (Plus / Pro / Business) OAuth with a plan that includes Codex image generation; platform API keys are not supported by this connector.
  - **xAI:** a SuperGrok OAuth connection with Imagine access, or an API key with access to Grok Imagine and available API credits.

The plugin uses the OpenCode SDK only for development-time types. Its runtime
entrypoint exports a plain plugin definition without importing SDK schemas or
Effect, avoiding initialization failures when the host's Effect version differs
from the development SDK (such as `Schema.isStartsWith is not a function`).

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

The plugin first checks the provider used by the current OpenCode session. If that provider has an image connector, it is used. Supported provider IDs are `openai` and `xai`.

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

### Using Grok Imagine

The plugin reuses your active xAI connection, including SuperGrok subscription OAuth. If needed, run `/connect`, select xAI, and sign in with your subscription or supply an API key. Credentials are resolved through OpenCode again at execution so refreshed OAuth tokens are used. Both authentication types use `https://api.x.ai/v1/images/generations` and `/images/edits`; account limits and model access still apply. Select an xAI session model to use its image connector, or configure it as the fallback for sessions without an available connector:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "github:mcostasilva/opencode-image-gen",
      "options": { "fallbackConnector": "xai" },
    },
  ],
}
```

The session provider takes precedence: a working OpenAI connector still wins over an xAI fallback. Fallback occurs only when a connector's connection is unavailable, not after an API error or unsupported option. Credentials stay in OpenCode's integration system, not plugin options.

Before each model request, the plugin resolves the effective connector and presents only its supported arguments. For example, an xAI session falling back to OpenAI sees OpenAI's schema, without `aspect_ratio` or `resolution`. The schema fixes the required `connector` argument to the selected connector; it is not a user-selectable override.

The selection is pinned for that call. If its credentials become unavailable before execution, the call fails with a retry message. The next model request resolves fallback again and gets the corresponding schema. If no connector is available, image tools are omitted for that request with connection guidance.

## Tools

Ask any agent in natural language. It will pick the matching tool.

Image tools are **direct tools**, not Code Mode tools: call `generate_image` or `edit_image` directly, rather than `tools.generate_image()` inside `execute`. OpenCode builds the Code Mode catalog before per-request context hooks, so direct registration is needed for connector-specific schemas. Schemas are request-local, including when multiple sessions use different connectors concurrently.

### `generate_image`

Generates a brand-new image from text through the configured AI image-generation connector. It does not accept source images and does not perform local image processing.

| Argument | Values | Default |
| --- | --- | --- |
| `connector` | Single value fixed by the current tool schema: `openai` or `xai` | required; selected automatically |
| `prompt` | Image description | required |
| `size` | `auto`, `1024x1024`, `1536x1024`, `1024x1536` | `auto` |
| `aspect_ratio` | xAI only: `auto`, `1:1`, `3:4`, `4:3`, `9:16`, `16:9`, `2:3`, `3:2`, `9:19.5`, `19.5:9`, `9:20`, `20:9`, `1:2`, `2:1`, `21:9`, `5:2` | service default |
| `resolution` | xAI only: `1k`, `2k` | service default (`1k`) |
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

### xAI option support

- `size` selects shape only: `1024x1024` → `1:1`, `1536x1024` → `3:2`, `1024x1536` → `2:3`. Exact pixel dimensions are not guaranteed, and outputs are not resized.
- Use `aspect_ratio` and `resolution` for native Grok controls. An explicit `size` cannot be combined with `aspect_ratio`. Both native fields are rejected by the OpenAI connector.
- Omitted aspect ratio leaves generation to the model and editing to the service default (the first reference image's ratio).
- `quality` supports `auto`, `low`, and `medium`; `high` is rejected. The service currently uses low for automatic generation and medium for automatic editing.
- `background` is absent from the xAI schema and must be omitted; the connector uses `auto` internally.
- References must be PNG, JPEG, or WebP. GIF is rejected by xAI.
- PNG, WebP, and JPEG outputs are supported. xAI's returned image is converted locally with Sharp when needed to match `output_format`; file bytes, extension, and MIME agree. Converting a JPEG to PNG does not add transparency or recover lost detail.

Example tool input when the xAI connector is selected:

```json
{
  "connector": "xai",
  "prompt": "A watercolor lighthouse at dawn",
  "aspect_ratio": "16:9",
  "resolution": "2k",
  "quality": "medium",
  "directory": "generated",
  "file_name": "lighthouse.png"
}
```

Directories and reference paths resolve from the active session's working directory. Absolute directories and reference paths are allowed only if they stay inside that working directory. `file_name` cannot contain a directory. Existing outputs are never overwritten; the plugin writes `name-v2.png`, `name-v3.png`, and so on.

## How it works

1. Before model dispatch, the plugin reads the effective request provider and resolves its image connector or the configured fallback through `ctx.integration.connection`.
2. It narrows the direct tool schemas to that connector's arguments, with a fixed `connector` value.
3. At execution, it validates the supplied arguments, reads the session working directory, and resolves the pinned connector's credentials again. It does not switch connectors mid-call.
4. OpenAI sends a Responses request to ChatGPT's Codex backend with the hosted `image_generation` tool (`gpt-image-2`). xAI sends a JSON request to `https://api.x.ai/v1/images/generations` or `/edits` using `grok-imagine-image-2.0` and base64 output.
5. The returned image is written inside the session working directory and returned as OpenCode file content so the model can inspect it.

Credentials are used only for connector requests and are not added to tool output. Provider HTTP errors include the status and verbatim response body; Codex stream failures preserve the full error event, including codes and messages. Connection-resolution errors are also surfaced to the model. Whenever fallback is selected, the model context and tool descriptions identify the fallback connector and the reason. Result metadata identifies the connector, model, and billing mode (`subscription` or `api`).

## Limitations

- This is an unofficial third-party plugin, not affiliated with OpenAI, xAI, or OpenCode.
- Subscription image generation uses the undocumented Codex endpoint OpenCode already uses for ChatGPT chat (`https://chatgpt.com/backend-api/codex/responses`). It can change without notice.
- Pixel-precise mask inpainting is not supported on the OAuth path.
- Image availability and usage limits depend on the connected ChatGPT account.

Use must comply with OpenAI's [Terms of Use](https://openai.com/policies/row-terms-of-use/) and [Usage Policies](https://openai.com/policies/usage-policies/).

For xAI capabilities and billing, see the official [image generation guide](https://docs.x.ai/developers/model-capabilities/images/generation), [image editing guide](https://docs.x.ai/developers/model-capabilities/images/editing), and [pricing](https://docs.x.ai/developers/pricing).

## Development

```sh
bun install
bun run check
npm pack --dry-run
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for local plugin setup and contribution guidelines.
