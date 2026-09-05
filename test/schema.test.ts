import { expect, test } from "bun:test"
import { parseImageOptions } from "../src/schema.ts"

test("parses generate options with defaults", () => {
  expect(
    parseImageOptions(
      { prompt: "a lighthouse", directory: ".", file_name: "lighthouse.png" },
      "generate",
    ),
  ).toEqual({
    prompt: "a lighthouse",
    size: "auto",
    quality: "auto",
    background: "auto",
    outputFormat: "png",
    directory: ".",
    fileName: "lighthouse.png",
    images: [],
  })
})

test("rejects images on generate_image", () => {
  expect(() =>
    parseImageOptions(
      { prompt: "x", directory: ".", file_name: "x.png", images: ["a.png"] },
      "generate",
    ),
  ).toThrow("does not accept images")
})

test("requires images on edit_image", () => {
  expect(() =>
    parseImageOptions(
      { prompt: "make it night", directory: ".", file_name: "night.png" },
      "edit",
    ),
  ).toThrow("requires images")
})

test("requires an explicit output directory and filename", () => {
  expect(() => parseImageOptions({ prompt: "x", file_name: "x.png" }, "generate")).toThrow(
    "directory is required",
  )
  expect(() => parseImageOptions({ prompt: "x", directory: "." }, "generate")).toThrow(
    "file_name is required",
  )
})

test("parses edit options", () => {
  expect(
    parseImageOptions(
      {
        prompt: "make it night",
        images: ["hero.png"],
        output_format: "webp",
        directory: "assets/generated",
        file_name: "hero.webp",
        size: "1536x1024",
      },
      "edit",
    ),
  ).toMatchObject({
    prompt: "make it night",
    images: ["hero.png"],
    outputFormat: "webp",
    directory: "assets/generated",
    fileName: "hero.webp",
    size: "1536x1024",
  })
})
