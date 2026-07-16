import OpenAI, { toFile } from "openai";
import JSZip from "jszip";

const MAX_EXTRACTED_CHARACTERS = 60_000;
const MAX_ARCHIVE_ENTRIES = 2_000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_TRANSCRIPTION_BYTES = 24 * 1024 * 1024;
const MAX_PDF_PAGES = 100;

export type ArtifactExtraction = {
  deckText: string;
  transcript: string;
  deckCharacters: number;
  transcriptCharacters: number;
};

export class ArtifactValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactValidationError";
  }
}

export async function extractPitchArtifacts({
  deck,
  deckMimeType,
  video,
  videoMimeType,
  videoFileName
}: {
  deck: Uint8Array;
  deckMimeType: string;
  video: Uint8Array;
  videoMimeType: string;
  videoFileName: string;
}): Promise<ArtifactExtraction> {
  assertVideoSignature(video, videoMimeType);
  const [deckText, transcript] = await Promise.all([
    extractDeckText(deck, deckMimeType),
    transcribePitchVideo(video, videoMimeType, videoFileName)
  ]);

  return {
    deckText,
    transcript,
    deckCharacters: deckText.length,
    transcriptCharacters: transcript.length
  };
}

export async function extractDeckText(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "application/pdf") {
    assertPdfSignature(bytes);
    return extractPdfText(bytes);
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    assertZipSignature(bytes);
    return extractPowerPointText(bytes);
  }

  throw new ArtifactValidationError("Unsupported pitch deck format.");
}

export function assertVideoSignature(bytes: Uint8Array, mimeType: string) {
  const isMp4Family = mimeType === "video/mp4" || mimeType === "video/quicktime" || mimeType === "video/x-m4v";
  const hasFtyp = bytes.length >= 12 && ascii(bytes.slice(4, 8)) === "ftyp";
  const hasWebmHeader = bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;

  if ((isMp4Family && hasFtyp) || (mimeType === "video/webm" && hasWebmHeader)) return;
  throw new ArtifactValidationError("The uploaded video contents do not match its declared format.");
}

export async function transcribePitchVideo(
  bytes: Uint8Array,
  mimeType: string,
  fileName: string
) {
  if (!process.env.GROQ_API_KEY) {
    throw new ArtifactValidationError("Video transcription is not configured.");
  }
  if (bytes.byteLength > MAX_TRANSCRIPTION_BYTES) {
    throw new ArtifactValidationError(
      "The pitch video is too large for transcription. Export a compressed video under 24 MB."
    );
  }

  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1"
  });
  const response = await client.audio.transcriptions.create({
    file: await toFile(bytes, fileName, { type: mimeType }),
    model: process.env.GROQ_TRANSCRIPTION_MODEL ?? "whisper-large-v3-turbo",
    response_format: "text"
  });

  const transcript = typeof response === "string" ? response : String(response);
  return boundedText(transcript, "Pitch transcript");
}

async function extractPdfText(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await getDocument({ data: bytes }).promise;
  const pages: string[] = [];

  try {
    if (document.numPages > MAX_PDF_PAGES) {
      throw new ArtifactValidationError(`The pitch deck exceeds the ${MAX_PDF_PAGES}-page processing limit.`);
    }
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .filter(Boolean)
          .join(" ")
      );
      if (pages.join("\n").length > MAX_EXTRACTED_CHARACTERS) break;
    }
  } finally {
    await document.destroy();
  }

  return boundedText(pages.join("\n"), "Pitch deck");
}

async function extractPowerPointText(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new ArtifactValidationError("The pitch deck archive contains too many files.");
  }

  const slideEntries = entries
    .filter((entry) => !entry.dir && /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((left, right) => slideNumber(left.name) - slideNumber(right.name));
  if (slideEntries.length === 0) {
    throw new ArtifactValidationError("The PowerPoint file does not contain readable slides.");
  }

  const declaredExpandedBytes = entries.reduce((total, entry) => {
    if (entry.dir) return total;
    const entryBytes = zipEntryUncompressedSize(entry);
    if (entryBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new ArtifactValidationError("The pitch deck contains a file beyond the safe processing limit.");
    }
    return total + entryBytes;
  }, 0);
  if (declaredExpandedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
    throw new ArtifactValidationError("The pitch deck expands beyond the safe processing limit.");
  }

  let expandedBytes = 0;
  const slides: string[] = [];
  for (const entry of slideEntries) {
    const extracted = await readZipEntryTextBounded(
      entry,
      MAX_ARCHIVE_UNCOMPRESSED_BYTES - expandedBytes
    );
    expandedBytes += extracted.bytes;
    const xml = extracted.text;
    slides.push(decodeXmlText(xml));
    if (slides.join("\n").length > MAX_EXTRACTED_CHARACTERS) break;
  }

  return boundedText(slides.join("\n"), "Pitch deck");
}

function readZipEntryTextBounded(entry: JSZip.JSZipObject, remainingBytes: number) {
  return new Promise<{ text: string; bytes: number }>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let expandedBytes = 0;
    let settled = false;
    const stream = entry.nodeStream("nodebuffer");

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      stream.pause();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    stream.on("data", (chunk: Uint8Array) => {
      if (settled) return;
      expandedBytes += chunk.byteLength;
      if (expandedBytes > remainingBytes) {
        fail(new ArtifactValidationError("The pitch deck expands beyond the safe processing limit."));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("error", fail);
    stream.on("end", () => {
      if (settled) return;
      settled = true;
      resolve({
        text: new TextDecoder("utf-8").decode(Buffer.concat(chunks)),
        bytes: expandedBytes
      });
    });
    stream.resume();
  });
}

function assertPdfSignature(bytes: Uint8Array) {
  if (ascii(bytes.slice(0, 5)) !== "%PDF-") {
    throw new ArtifactValidationError("The uploaded deck is not a valid PDF file.");
  }
}

function assertZipSignature(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || ![0x03, 0x05, 0x07].includes(bytes[2])) {
    throw new ArtifactValidationError("The uploaded deck is not a valid PowerPoint archive.");
  }
}

function boundedText(value: string, label: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) throw new ArtifactValidationError(`${label} does not contain readable text.`);
  return normalized.slice(0, MAX_EXTRACTED_CHARACTERS);
}

function decodeXmlText(xml: string) {
  return [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)]
    .map((match) => decodeXmlEntities(match[1]))
    .join(" ");
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function slideNumber(name: string) {
  return Number(name.match(/slide(\d+)\.xml$/i)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function zipEntryUncompressedSize(entry: JSZip.JSZipObject) {
  const internal = entry as JSZip.JSZipObject & {
    _data?: { uncompressedSize?: number };
  };
  const size = internal._data?.uncompressedSize;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
    throw new ArtifactValidationError("The pitch deck archive has invalid size metadata.");
  }
  return size;
}

function ascii(bytes: Uint8Array) {
  return new TextDecoder("ascii").decode(bytes);
}
