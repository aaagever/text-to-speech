// Reads a dropped/selected file into speech-friendly text. Supported types:
//   .txt          -> read as-is (whitespace tidied)
//   .md/.markdown -> stripMarkdown (no "hashtag hashtag" artifacts)
//   .docx         -> mammoth convertToHtml -> htmlToSpeechText (keeps structure)
// mammoth is dynamically imported so its weight only loads on first docx use.

import { stripMarkdown, finalizeSpeechText } from "./markdown-strip";
import { htmlToSpeechText } from "./html-to-speech-text";
import { createLogger } from "./log";

const log = createLogger("file");

export interface ExtractedText {
  text: string;
  filename: string;
}

export const ACCEPTED_EXTENSIONS = [".txt", ".md", ".markdown", ".docx"];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

async function extractDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const mod = await import("mammoth/mammoth.browser");
  // Drop images (we only voice text): emit an empty <img>, which the linearizer
  // skips. This also avoids embedding base64 image data in memory.
  const dropImage = mod.images.imgElement(() => ({ src: "" }));
  const result = await mod.convertToHtml({ arrayBuffer }, { convertImage: dropImage });
  if (result.messages.length) {
    log.warn(`mammoth messages for ${file.name}:`, result.messages);
  }
  return htmlToSpeechText(result.value);
}

export async function extractText(file: File): Promise<ExtractedText> {
  const ext = extensionOf(file.name);
  log.info(`reading ${file.name} (${file.size} bytes, ${ext || "no extension"})`);

  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Unsupported file type "${ext || file.name}". Use a .txt, .md, or .docx file.`
    );
  }

  let text: string;
  if (ext === ".docx") {
    text = await extractDocx(file);
  } else if (ext === ".md" || ext === ".markdown") {
    text = stripMarkdown(await file.text());
  } else {
    text = finalizeSpeechText(await file.text());
  }

  log.info(`extracted ${text.length} chars from ${file.name}`);
  return { text, filename: file.name };
}
