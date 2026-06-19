/**
 * @fileoverview Compact AST representation for LLM prompts.
 *
 * Instead of JSON.stringify(astInfo) (~600-800 tokens per component),
 * forms a compact text representation (~50-100 tokens).
 *
 * Auto-mode: if source ≤ MAX_COMPACT_LINES lines — send only
 * compact signatures (no code). Otherwise — signatures + code.
 */

import { ComponentInfo } from "../types.js";

/** Threshold: files longer than this get code, shorter — only signatures */
const MAX_COMPACT_LINES = 100;

/**
 * Builds compact text representation of ComponentInfo.
 * Format — key-value, one line per element.
 */
export function toCompactAst(info: ComponentInfo): string {
  const lines: string[] = [];

  lines.push(`Type: ${info.fileType}`);
  if (info.name) lines.push(`Name: ${info.name}`);
  lines.push(`Exports: ${info.exportsComponent}`);

  // Props
  if (info.props.length > 0) {
    const propsStr = info.props
      .map((p) => `${p.name}${p.required ? "" : "?"}: ${p.type ?? "any"}${p.defaultValue != null ? ` = ${JSON.stringify(p.defaultValue)}` : ""}`)
      .join(", ");
    lines.push(`Props: { ${propsStr} }`);
  }

  // State
  if (info.state.length > 0) {
    lines.push(`State: [${info.state.map((s) => s.variable).join(", ")}]`);
  }

  // Effects
  if (info.effects.length > 0) {
    const effectsStr = info.effects
      .map((e) => `useEffect([${e.deps.join(", ")}])`)
      .join(", ");
    lines.push(`Effects: ${effectsStr}`);
  }

  // Handlers
  if (info.handlers.length > 0) {
    lines.push(`Handlers: [${info.handlers.map((h) => h.name).join(", ")}]`);
  }

  // JSX tree
  if (info.jsxTree.length > 0) {
    // Unique, preserving order
    const unique = [...new Set(info.jsxTree)];
    lines.push(`JSX: <${unique.join(">, <")}>`);
  }

  // Context
  if (info.hasContext) {
    lines.push("Context: createContext detected");
  }

  // Store
  if (info.hasStore) {
    lines.push("Store: state management detected");
  }

  return lines.join("\n");
}

/**
 * Determines whether to send source code to LLM.
 * Files ≤ MAX_COMPACT_LINES lines — signatures enough.
 * Longer — code needed for logic understanding.
 */
export function shouldIncludeCode(code: string): boolean {
  const lineCount = code.split("\n").length;
  return lineCount > MAX_COMPACT_LINES;
}

/**
 * Builds payload for LLM prompt:
 * - compact AST (always)
 * - source code (only if shouldIncludeCode)
 *
 * Returns an object with fields for prompt substitution.
 */
export function buildPromptPayload(info: ComponentInfo, code: string): {
  AST_INFO: string;
  CODE: string;
} {
  const compactAst = toCompactAst(info);
  const includeCode = shouldIncludeCode(code);

  return {
    AST_INFO: compactAst,
    CODE: includeCode ? code : "(code omitted — see AST signatures above)",
  };
}
