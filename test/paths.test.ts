import { expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  mimeFromBytes,
  resolveInsideProject,
  resolveOutputPath,
  versionedPath,
  writeUniqueFile,
} from "../src/paths.ts"

test("rejects paths that escape the working directory", () => {
  const root = "/tmp/project"
  expect(() => resolveInsideProject(root, "../secret.png", "images")).toThrow("must stay inside")
  expect(() => resolveInsideProject(root, "/etc/passwd", "directory")).toThrow("must stay inside")
})

test("resolves relative output inside the working directory", () => {
  const root = "/tmp/project"
  expect(resolveInsideProject(root, "assets/hero.png", "file_name")).toBe(
    path.resolve(root, "assets/hero.png"),
  )
})

test("combines directory and file_name inside the working directory", () => {
  const resolved = resolveOutputPath("/tmp/project", "assets", "hero.png", "png")
  expect(resolved).toBe(path.resolve("/tmp/project", "assets", "hero.png"))
})

test("appends a missing extension and rejects mismatches", () => {
  expect(resolveOutputPath("/tmp/project", ".", "hero", "jpeg")).toBe(
    path.resolve("/tmp/project", "hero.jpg"),
  )
  expect(() => resolveOutputPath("/tmp/project", ".", "hero.jpg", "png")).toThrow(
    "must match output_format",
  )
})

test("rejects directories embedded in file_name", () => {
  expect(() => resolveOutputPath("/tmp/project", ".", "assets/hero.png", "png")).toThrow(
    "filename only",
  )
})

test("versions colliding filenames", () => {
  expect(versionedPath("/tmp/project/hero.png", 2)).toBe("/tmp/project/hero-v2.png")
})

test("writeUniqueFile does not overwrite", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "image-gen-"))
  const target = path.join(dir, "hero.png")
  await writeFile(target, "first")
  const result = await writeUniqueFile(target, Buffer.from("second"))
  expect(result.versioned).toBe(true)
  expect(result.savedPath).toBe(path.join(dir, "hero-v2.png"))
  expect(await readFile(target, "utf8")).toBe("first")
  expect(await readFile(result.savedPath, "utf8")).toBe("second")
})

test("detects image types from magic bytes", () => {
  expect(mimeFromBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe("image/png")
  expect(mimeFromBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg")
  expect(
    mimeFromBytes(Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")])),
  ).toBe("image/webp")
  expect(() => mimeFromBytes(Buffer.from("not-an-image"))).toThrow("not a PNG")
})
