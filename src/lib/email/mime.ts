/**
 * Turns a Gmail API message (format "full") into the few fields this app uses.
 *
 * Emails are untrusted input: the parser never executes or renders anything,
 * bounds recursion and output size, skips attachments, and tolerates broken
 * encodings by falling back instead of throwing.
 */

export const MAX_BODY_CHARS = 8000;
const MAX_DEPTH = 12;
const MAX_PARTS = 200;

type Header = { name?: string | null; value?: string | null };
export type MessagePart = {
  mimeType?: string | null;
  filename?: string | null;
  headers?: Header[] | null;
  body?: { data?: string | null; attachmentId?: string | null; size?: number | null } | null;
  parts?: MessagePart[] | null;
};
export type GmailMessageLike = {
  id?: string | null;
  threadId?: string | null;
  labelIds?: string[] | null;
  snippet?: string | null;
  internalDate?: string | null;
  payload?: MessagePart | null;
};

export type ParsedEmail = {
  id: string;
  threadId: string;
  fromName: string | null;
  fromEmail: string | null;
  subject: string;
  snippet: string;
  receivedAt: string;
  isUnread: boolean;
  labelIds: string[];
  bodyText: string;
};

export function parseGmailMessage(msg: GmailMessageLike): ParsedEmail {
  if (!msg.id || !msg.threadId) throw new Error("Message is missing its ID.");
  const headers = msg.payload?.headers ?? [];
  const from = parseAddress(decodeHeader(header(headers, "From") ?? ""));
  const labelIds = (msg.labelIds ?? []).slice(0, 50);
  return {
    id: msg.id,
    threadId: msg.threadId,
    fromName: from.name,
    fromEmail: from.email,
    subject: clip(oneLine(decodeHeader(header(headers, "Subject") ?? "")), 1000) || "(no subject)",
    snippet: clip(oneLine(decodeEntities(msg.snippet ?? "")), 1000),
    receivedAt: receivedAt(msg.internalDate, header(headers, "Date")),
    isUnread: labelIds.includes("UNREAD"),
    labelIds,
    bodyText: msg.payload ? extractBody(msg.payload) : "",
  };
}

function header(headers: Header[], name: string) {
  const lower = name.toLowerCase();
  return headers.find((h) => h.name?.toLowerCase() === lower)?.value ?? null;
}

function receivedAt(internalDate: string | null | undefined, dateHeader: string | null) {
  const ms = Number(internalDate);
  if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  const parsed = dateHeader ? Date.parse(dateHeader) : NaN;
  return new Date(Number.isFinite(parsed) ? parsed : 0).toISOString();
}

/** "Jane Doe" <jane@x.com>, jane@x.com, Jane <jane@x.com> → { name, email } */
export function parseAddress(raw: string): { name: string | null; email: string | null } {
  const value = raw.trim();
  const angle = value.match(/^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  if (angle) {
    const name = angle[1].trim().replace(/^"(.*)"$/, "$1").trim();
    return { name: name ? clip(name, 300) : null, email: clip(angle[2].toLowerCase(), 320) };
  }
  const bare = value.match(/[^\s<>",;]+@[^\s<>",;]+/);
  return { name: null, email: bare ? clip(bare[0].toLowerCase(), 320) : null };
}

/** Decodes RFC 2047 "encoded words" such as =?UTF-8?B?SGk=?= in headers. */
export function decodeHeader(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, "?==?") // whitespace between encoded words is not content
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, charset: string, enc: string, text: string) => {
      try {
        const bytes =
          enc.toUpperCase() === "B"
            ? Buffer.from(text, "base64")
            : Buffer.from(
                text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))),
                "latin1",
              );
        return decodeBytes(bytes, charset);
      } catch {
        return whole;
      }
    });
}

function decodeBytes(bytes: Uint8Array, charset: string | null | undefined) {
  try {
    return new TextDecoder((charset || "utf-8").trim().toLowerCase()).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes); // unknown charset label
  }
}

function charsetOf(part: MessagePart) {
  return header(part.headers ?? [], "Content-Type")?.match(/charset\s*=\s*"?([^";\s]+)/i)?.[1] ?? null;
}

function isAttachment(part: MessagePart) {
  if (part.filename || part.body?.attachmentId) return true;
  return /^\s*attachment/i.test(header(part.headers ?? [], "Content-Disposition") ?? "");
}

/** Prefers text/plain; falls back to text/html converted to text. */
export function extractBody(root: MessagePart): string {
  const plain: string[] = [];
  const html: string[] = [];
  let visited = 0;

  const walk = (part: MessagePart, depth: number) => {
    if (depth > MAX_DEPTH || ++visited > MAX_PARTS || isAttachment(part)) return;
    const type = (part.mimeType ?? "").toLowerCase();
    if (type.startsWith("multipart/")) {
      for (const child of part.parts ?? []) walk(child, depth + 1);
      return;
    }
    const data = part.body?.data;
    if (!data) return;
    if (type === "text/plain" || type === "text/html") {
      const text = decodeBytes(Buffer.from(data, "base64url"), charsetOf(part));
      (type === "text/plain" ? plain : html).push(text);
    }
  };
  walk(root, 0);

  const text = plain.length ? plain.join("\n\n") : html.map(htmlToText).join("\n\n");
  return clip(normaliseWhitespace(text), MAX_BODY_CHARS);
}

/** Readable text from HTML. Nothing is rendered; tags are removed. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|head|title|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ")
      // Best effort: drop simple hidden elements, a common place for text meant only for machines.
      .replace(/<(\w+)\b[^>]*style\s*=\s*["'][^"']*(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0)[^"']*["'][^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table)\s*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]*>/g, " "),
  );
}

export function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    }
    return named[code.toLowerCase()] ?? whole;
  });
}

function normaliseWhitespace(s: string) {
  return s
    .replace(/\r\n?/g, "\n")
    // Control characters (except tab/newline) can hide or garble text.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function oneLine(s: string) {
  return normaliseWhitespace(s).replace(/\s+/g, " ");
}

function clip(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

