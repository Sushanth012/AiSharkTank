import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  ArtifactValidationError,
  assertVideoSignature,
  extractDeckText
} from "./extract";

describe("artifact validation", () => {
  it("accepts MP4 and WebM signatures", () => {
    const mp4 = new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]);
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
    expect(() => assertVideoSignature(mp4, "video/mp4")).not.toThrow();
    expect(() => assertVideoSignature(webm, "video/webm")).not.toThrow();
  });

  it("rejects a file whose contents do not match the video MIME type", () => {
    expect(() => assertVideoSignature(new Uint8Array([1, 2, 3, 4]), "video/mp4")).toThrow(
      ArtifactValidationError
    );
  });

  it("extracts bounded slide text from a valid PPTX archive", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide2.xml", "<p:sld><a:t>Second &amp; final</a:t></p:sld>");
    zip.file("ppt/slides/slide1.xml", "<p:sld><a:t>First slide</a:t></p:sld>");
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(
      extractDeckText(
        bytes,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      )
    ).resolves.toBe("First slide Second & final");
  });

  it("rejects malformed PDF and PowerPoint uploads before parsing", async () => {
    await expect(extractDeckText(new Uint8Array([1, 2, 3]), "application/pdf")).rejects.toThrow(
      "not a valid PDF"
    );
    await expect(
      extractDeckText(
        new Uint8Array([1, 2, 3]),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      )
    ).rejects.toThrow("not a valid PowerPoint");
  });

  it("rejects highly compressed PowerPoint archives before expanding slide contents", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", "x".repeat(20 * 1024 * 1024 + 1));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

    await expect(
      extractDeckText(
        bytes,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      )
    ).rejects.toThrow("safe processing limit");
  });
});
