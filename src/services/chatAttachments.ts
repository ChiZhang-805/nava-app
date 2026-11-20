import { CHAT_DOCUMENT_MAX_CHARS, CHAT_DOCUMENT_NAME_MAX_CHARS, type ChatDocumentContext } from "../../supabase/functions/_shared/chat-document-contract.ts";

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_MAX_BYTES = 2 * 1024 * 1024;

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const supportedImageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const supportedDocumentTypes = new Set(["text/plain", "text/markdown", "text/csv", "application/json"]);
const supportedDocumentExtensions = new Set(["txt", "md", "markdown", "csv", "json"]);

function extensionOf(name: string) {
  const match = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export type PendingChatDocument = ChatDocumentContext;

export function validateChatImage(file: File) {
  const supported = supportedImageTypes.has(file.type.toLowerCase())
    || (!file.type && supportedImageExtensions.has(extensionOf(file.name)));
  if (!supported) return "unsupported" as const;
  if (file.size <= 0) return "empty" as const;
  if (file.size > IMAGE_MAX_BYTES) return "too_large" as const;
  return null;
}

export async function readChatDocument(file: File): Promise<PendingChatDocument> {
  const supported = supportedDocumentTypes.has(file.type.toLowerCase())
    || (!file.type && supportedDocumentExtensions.has(extensionOf(file.name)));
  if (!supported) throw new Error("unsupported");
  if (file.size <= 0) throw new Error("empty");
  if (file.size > DOCUMENT_MAX_BYTES) throw new Error("too_large");

  const normalized = (await file.text()).replace(/\0/g, "").trim();
  if (!normalized) throw new Error("empty");
  return {
    name: file.name.replace(/\0/g, "").trim().slice(0, CHAT_DOCUMENT_NAME_MAX_CHARS) || "document.txt",
    content: normalized.slice(0, CHAT_DOCUMENT_MAX_CHARS),
    truncated: normalized.length > CHAT_DOCUMENT_MAX_CHARS,
  };
}

export function buildChatDocumentRequest(document: PendingChatDocument, prompt: string, locale: "zh" | "en") {
  const request = prompt.trim() || (locale === "zh" ? "请概括这份文件的重点，并告诉我接下来值得关注什么。" : "Summarize the key points in this file and tell me what deserves attention next.");
  // The backend wraps this dedicated field as untrusted reference material.
  // Never inflate the user's 600-character message with the document body.
  return { message: request, documentContext: { ...document } };
}

export const chatAttachmentAccept = {
  images: "image/jpeg,image/png,image/webp",
  documents: ".txt,.md,.markdown,.csv,.json,text/plain,text/markdown,text/csv,application/json",
};
