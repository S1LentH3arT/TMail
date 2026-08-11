import type { Root, RootContent } from "mdast";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import rehypeSanitize from "rehype-sanitize";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import type { MessageBody } from "../domain/message.js";

export const BODY_INPUT_LIMIT_BYTES = 2 * 1_024 * 1_024;
export const BODY_OUTPUT_LIMIT_BYTES = 1 * 1_024 * 1_024;
export const BODY_OUTPUT_LIMIT_LINES = 20_000;

const strictSchema = {
  tagNames: [
    "a",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  attributes: {
    a: ["href"],
    ol: ["start"],
  },
  protocols: {
    href: ["http", "https", "mailto"],
  },
  strip: ["script", "style", "iframe", "object", "embed", "img", "svg"],
};

export interface NormalizedBody {
  readonly root: Root;
  readonly markdown: string;
  readonly truncated: boolean;
}

function sanitizeTerminalText(value: string): string {
  // biome-ignore lint/complexity/useRegexLiterals: constructors avoid raw terminal controls in regex literals.
  const oscSequence = new RegExp("\\x1B\\][^\\x07]*(?:\\x07|\\x1B\\\\)", "gu");
  // biome-ignore lint/complexity/useRegexLiterals: constructors avoid raw terminal controls in regex literals.
  const ansiSequence = new RegExp("\\x1B(?:[@-_]|\\[[0-?]*[ -/]*[@-~])", "gu");
  // biome-ignore lint/complexity/useRegexLiterals: constructors avoid raw terminal controls in regex literals.
  const controlCharacters = new RegExp("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1A\\x1C-\\x1F\\x7F]", "gu");
  return value
    .replace(oscSequence, "")
    .replace(ansiSequence, "")
    .replace(controlCharacters, "")
    .replace(/[\u202A-\u202E\u2066-\u2069]/gu, "");
}

function truncateUtf8(value: string, limit: number): { value: string; truncated: boolean } {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= limit) {
    return { value, truncated: false };
  }
  return {
    value: new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, limit)),
    truncated: true,
  };
}

function sanitizeTree(node: Root | RootContent): void {
  if (node.type === "text" || node.type === "code" || node.type === "inlineCode") {
    node.value = sanitizeTerminalText(node.value);
  }
  if ("children" in node) {
    for (const child of node.children) {
      sanitizeTree(child);
    }
  }
}

function truncateOutput(value: string): { value: string; truncated: boolean } {
  const lines = value.split("\n");
  const lineLimited = lines.length > BODY_OUTPUT_LIMIT_LINES;
  const joined = lineLimited ? lines.slice(0, BODY_OUTPUT_LIMIT_LINES).join("\n") : value;
  const byteLimited = truncateUtf8(joined, BODY_OUTPUT_LIMIT_BYTES);
  return { value: byteLimited.value, truncated: lineLimited || byteLimited.truncated };
}

function plainTextRoot(value: string): Root {
  return {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value }] }],
  };
}

export async function normalizeBody(body: MessageBody): Promise<NormalizedBody> {
  const input = truncateUtf8(sanitizeTerminalText(body.content), BODY_INPUT_LIMIT_BYTES);
  let root: Root;

  if (body.kind === "plain") {
    root = plainTextRoot(input.value);
  } else {
    const processor = unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeSanitize, strictSchema)
      .use(rehypeRemark);
    const hast = processor.parse(input.value);
    root = (await processor.run(hast)) as Root;
  }

  sanitizeTree(root);
  const markdownProcessor = unified().use(remarkStringify, {
    bullet: "-",
    fences: true,
    listItemIndent: "one",
  });
  const serialized = markdownProcessor.stringify(root);
  const output = truncateOutput(serialized);

  return {
    root,
    markdown: output.value,
    truncated: Boolean(body.truncated) || input.truncated || output.truncated,
  };
}
