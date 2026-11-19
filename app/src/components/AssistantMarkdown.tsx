"use client";

import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  closeIncompleteMarkdown,
  latexToReadable,
  prepareMarkdown,
  sanitizeAssistantUrl,
} from "@/lib/ai/responseFormat";

export interface AssistantMarkdownProps {
  content: string;
  streaming?: boolean;
  className?: string;
}

const NUMERIC_CELL_RE = /^[+−-]?\d+(?:[.,]\d+)?(?:\s*(?:%|bb|BB|fichas|chips|x|\$))?$/;

function extractTextContent(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractTextContent).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractTextContent(node.props.children);
  }
  return "";
}

function isNumericCell(children: React.ReactNode): boolean {
  const raw = extractTextContent(children).trim();
  return raw.length > 0 && raw.length <= 24 && NUMERIC_CELL_RE.test(raw);
}

const MARKDOWN_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h3 className="text-sm font-extrabold tracking-tight text-slate-100 mt-3 first:mt-0 mb-1.5">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h4 className="text-[0.8125rem] font-bold text-slate-100 mt-2.5 first:mt-0 mb-1">
      {children}
    </h4>
  ),
  h3: ({ children }) => (
    <h5 className="text-xs font-bold uppercase tracking-wider text-sky-300 mt-2.5 first:mt-0 mb-1">
      {children}
    </h5>
  ),
  h4: ({ children }) => (
    <h6 className="text-xs font-semibold text-slate-200 mt-2 first:mt-0 mb-1">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="text-[0.84375rem] leading-relaxed text-slate-200 my-1.5 first:mt-0 last:mb-0 break-words">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-slate-300">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="my-1.5 space-y-1 pl-4 list-disc marker:text-sky-400 text-[0.84375rem] text-slate-200">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 space-y-1 pl-4 list-decimal marker:text-sky-400 text-[0.84375rem] text-slate-200">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed break-words">{children}</li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-sky-500/60 bg-slate-900/60 pl-3 py-1.5 pr-2 rounded-r-lg text-xs text-slate-300">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2.5 border-slate-800/80" />,
  a: ({ href, children }) => {
    const safeHref = sanitizeAssistantUrl(href ?? "");
    if (!safeHref) {
      return (
        <span
          className="text-slate-300 underline decoration-dotted"
          title="Link desativado por segurança"
        >
          {children}
        </span>
      );
    }
    const isExternal = /^https?:\/\//i.test(safeHref) || /^mailto:/i.test(safeHref);
    return (
      <a
        href={safeHref}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer nofollow" : undefined}
        className="text-sky-300 underline underline-offset-2 hover:text-sky-200 break-all"
      >
        {children}
      </a>
    );
  },
  img: ({ alt }) => (
    <span className="inline-block rounded bg-slate-900 border border-slate-800 px-2 py-0.5 text-[0.6875rem] text-slate-400">
      [Imagem externa não carregada{alt ? `: ${alt}` : ""}]
    </span>
  ),
  table: ({ children }) => (
    <div
      role="region"
      aria-label="Tabela de dados"
      tabIndex={0}
      className="my-2.5 w-full max-w-full overflow-x-auto rounded-xl border border-[#1E293B] bg-[#05070B]/95"
    >
      <table className="w-full min-w-[260px] border-collapse text-xs text-slate-200">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[#0F172A] text-slate-200 border-b border-[#1E293B]">
      {children}
    </thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-[#1E293B]/70">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="hover:bg-slate-900/50 transition-colors">{children}</tr>
  ),
  th: ({ children }) => (
    <th
      className={`px-3 py-2 font-bold uppercase tracking-wider text-[0.6875rem] text-slate-300 whitespace-nowrap ${
        isNumericCell(children) ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  ),
  td: ({ children }) => {
    const numeric = isNumericCell(children);
    return (
      <td
        className={`px-3 py-2 align-top ${
          numeric
            ? "text-right font-mono tabular-nums whitespace-nowrap text-slate-100"
            : "text-left text-slate-200"
        }`}
      >
        {children}
      </td>
    );
  },
  pre: ({ children }) => {
    if (
      React.isValidElement<{ className?: string; children?: React.ReactNode }>(children) &&
      typeof children.props.className === "string" &&
      children.props.className.includes("language-math")
    ) {
      const rawMath = extractTextContent(children.props.children);
      return (
        <div
          role="math"
          aria-label="Fórmula matemática"
          className="my-2 w-full max-w-full overflow-x-auto rounded-xl border border-sky-500/30 bg-[#05070B] px-3 py-2 font-mono text-xs text-sky-200"
        >
          {latexToReadable(rawMath)}
        </div>
      );
    }
    return (
      <pre className="my-2 w-full max-w-full overflow-x-auto rounded-xl border border-[#1E293B] bg-[#05070B] p-3 font-mono text-xs text-slate-200">
        {children}
      </pre>
    );
  },
  code: ({ className, children }) => {
    const cls = className ?? "";
    const text = extractTextContent(children).replace(/\n$/, "");
    if (cls.includes("language-math") || cls.includes("math-inline") || cls.includes("math-display")) {
      const readable = latexToReadable(text);
      if (cls.includes("math-display")) {
        return (
          <div
            role="math"
            aria-label="Fórmula matemática"
            className="my-2 w-full max-w-full overflow-x-auto rounded-xl border border-sky-500/30 bg-[#05070B] px-3 py-2 font-mono text-xs text-sky-200"
          >
            {readable}
          </div>
        );
      }
      return (
        <span
          role="math"
          aria-label="Fórmula matemática"
          className="inline-block rounded border border-sky-500/30 bg-[#05070B] px-1.5 py-0.5 font-mono text-[0.78rem] text-sky-200"
        >
          {readable}
        </span>
      );
    }
    const isBlock = Boolean(cls.startsWith("language-")) || text.includes("\n");
    if (isBlock) {
      return <code className="font-mono text-xs text-slate-200">{text}</code>;
    }
    return (
      <code className="rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 font-mono text-[0.78rem] text-sky-200 break-words">
        {children}
      </code>
    );
  },
};

export function AssistantMarkdown({
  content,
  streaming = false,
  className = "",
}: AssistantMarkdownProps) {
  const safeContent = prepareMarkdown(
    streaming ? closeIncompleteMarkdown(content) : content,
  );
  if (!safeContent.trim()) return null;

  return (
    <div className={`min-w-0 max-w-full overflow-hidden ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        skipHtml
        urlTransform={(url) => sanitizeAssistantUrl(url) ?? ""}
        components={MARKDOWN_COMPONENTS}
      >
        {safeContent}
      </ReactMarkdown>
    </div>
  );
}
