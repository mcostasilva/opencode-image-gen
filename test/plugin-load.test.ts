import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

test("the public entrypoint has no runtime SDK or Effect dependency", async () => {
  const blocked: string[] = []
  const result = await Bun.build({
    entrypoints: [fileURLToPath(new URL("../index.ts", import.meta.url))],
    target: "bun",
    external: ["sharp"],
    plugins: [{
      name: "reject-host-runtime-imports",
      setup(build) {
        build.onResolve({ filter: /^(?:@opencode-ai\/|@opencode\/|effect(?:\/|$))/ }, (args) => {
          blocked.push(args.path)
          throw new Error(`Plugin must not import host SDK code at runtime: ${args.path}`)
        })
      },
    }],
  })
  expect(blocked).toEqual([])
  expect(result.success).toBe(true)
  expect(result.outputs).toHaveLength(1)
})
