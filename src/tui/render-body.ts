import type { Root } from "mdast";

interface AstNode {
  readonly type: string;
  readonly value?: string;
  readonly url?: string;
  readonly depth?: number;
  readonly ordered?: boolean;
  readonly start?: number;
  readonly children?: readonly AstNode[];
}

export interface RenderedBody {
  readonly lines: readonly string[];
  readonly links: readonly string[];
}

function inline(node: AstNode, links: string[]): string {
  switch (node.type) {
    case "text":
      return node.value ?? "";
    case "inlineCode":
      return `\`${node.value ?? ""}\``;
    case "break":
      return "\n";
    case "link": {
      const url = node.url ?? "";
      let index = links.indexOf(url);
      if (index === -1) {
        links.push(url);
        index = links.length - 1;
      }
      return `${childrenInline(node, links)} [${index + 1}]`;
    }
    case "strong":
      return childrenInline(node, links);
    case "emphasis":
      return childrenInline(node, links);
    default:
      return node.value ?? childrenInline(node, links);
  }
}

function childrenInline(node: AstNode, links: string[]): string {
  return (node.children ?? []).map((child) => inline(child, links)).join("");
}

function block(node: AstNode, links: string[], prefix = ""): string[] {
  switch (node.type) {
    case "heading":
      return [`${"#".repeat(node.depth ?? 1)} ${childrenInline(node, links)}`];
    case "paragraph":
      return childrenInline(node, links)
        .split("\n")
        .map((line) => `${prefix}${line}`);
    case "code":
      return (node.value ?? "").split("\n").map((line) => `${prefix}  ${line}`);
    case "blockquote":
      return (node.children ?? []).flatMap((child) => block(child, links, `${prefix}> `));
    case "thematicBreak":
      return [`${prefix}────────`];
    case "list":
      return (node.children ?? []).flatMap((child, index) => {
        const marker = node.ordered ? `${(node.start ?? 1) + index}. ` : "• ";
        const childLines = block(child, links);
        return childLines.map((line, lineIndex) => `${lineIndex === 0 ? marker : "  "}${line}`);
      });
    case "listItem":
      return (node.children ?? []).flatMap((child) => block(child, links, prefix));
    default:
      if (node.children) {
        return node.children.flatMap((child) => block(child, links, prefix));
      }
      return node.value ? [`${prefix}${node.value}`] : [];
  }
}

export function renderBody(root: Root): RenderedBody {
  const links: string[] = [];
  const ast = root as unknown as AstNode;
  const lines = (ast.children ?? []).flatMap((node, index) => [
    ...block(node, links),
    ...(index < (ast.children?.length ?? 0) - 1 ? [""] : []),
  ]);
  return { lines, links };
}
