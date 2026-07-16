import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openAiMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  createTranscription: vi.fn(),
  toFile: vi.fn()
}));

vi.mock("openai", () => {
  class OpenAIMock {
    audio = {
      transcriptions: {
        create: openAiMocks.createTranscription
      }
    };

    constructor(options: unknown) {
      openAiMocks.constructor(options);
    }
  }

  return {
    default: OpenAIMock,
    toFile: openAiMocks.toFile
  };
});

import {
  ArtifactValidationError,
  assertVideoSignature,
  extractDeckText,
  transcribePitchVideo
} from "./extract";

const originalGroqApiKey = process.env.GROQ_API_KEY;
const originalGroqBaseUrl = process.env.GROQ_BASE_URL;
const originalGroqModel = process.env.GROQ_TRANSCRIPTION_MODEL;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_BASE_URL;
  delete process.env.GROQ_TRANSCRIPTION_MODEL;
  openAiMocks.toFile.mockResolvedValue({ name: "pitch.mp4" });
  openAiMocks.createTranscription.mockResolvedValue(" A clear founder pitch. ");
});

afterEach(() => {
  restoreEnvironmentVariable("GROQ_API_KEY", originalGroqApiKey);
  restoreEnvironmentVariable("GROQ_BASE_URL", originalGroqBaseUrl);
  restoreEnvironmentVariable("GROQ_TRANSCRIPTION_MODEL", originalGroqModel);
});

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

  it("transcribes video through Groq's OpenAI-compatible endpoint", async () => {
    process.env.GROQ_API_KEY = "groq-test-key";

    await expect(
      transcribePitchVideo(new Uint8Array([1, 2, 3]), "video/mp4", "pitch.mp4")
    ).resolves.toBe("A clear founder pitch.");

    expect(openAiMocks.constructor).toHaveBeenCalledWith({
      apiKey: "groq-test-key",
      baseURL: "https://api.groq.com/openai/v1"
    });
    expect(openAiMocks.createTranscription).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "whisper-large-v3-turbo",
        response_format: "text"
      })
    );
  });

  it("honors custom Groq endpoint and transcription model settings", async () => {
    process.env.GROQ_API_KEY = "groq-test-key";
    process.env.GROQ_BASE_URL = "https://groq.example.test/openai/v1";
    process.env.GROQ_TRANSCRIPTION_MODEL = "custom-whisper";

    await transcribePitchVideo(new Uint8Array([1]), "video/webm", "pitch.webm");

    expect(openAiMocks.constructor).toHaveBeenCalledWith({
      apiKey: "groq-test-key",
      baseURL: "https://groq.example.test/openai/v1"
    });
    expect(openAiMocks.createTranscription).toHaveBeenCalledWith(
      expect.objectContaining({ model: "custom-whisper" })
    );
  });

  it("fails safely when Groq transcription is not configured", async () => {
    await expect(
      transcribePitchVideo(new Uint8Array([1]), "video/mp4", "pitch.mp4")
    ).rejects.toThrow("Video transcription is not configured");

    expect(openAiMocks.constructor).not.toHaveBeenCalled();
  });

  it("rejects videos above Groq's 24 MB application limit before making a request", async () => {
    process.env.GROQ_API_KEY = "groq-test-key";

    await expect(
      transcribePitchVideo(
        new Uint8Array(24 * 1024 * 1024 + 1),
        "video/mp4",
        "pitch.mp4"
      )
    ).rejects.toThrow("under 24 MB");

    expect(openAiMocks.constructor).not.toHaveBeenCalled();
  });
});

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
