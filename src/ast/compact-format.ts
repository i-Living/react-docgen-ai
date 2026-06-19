/**
 * @fileoverview Компактное представление AST-информации для LLM-промптов.
 *
 * Вместо JSON.stringify(astInfo) (который даёт ~600-800 токенов на компонент),
 * формирует сжатое текстовое представление (~50-100 токенов).
 *
 * Авто-режим: если исходник ≤ MAX_COMPACT_LINES строк — отправляем только
 * компактные сигнатуры (без кода). Иначе — сигнатуры + код.
 */

import { ComponentInfo } from "../types.js";

/** Порог: файлы длиннее этого — отправляем с кодом, короче — только сигнатуры */
const MAX_COMPACT_LINES = 100;

/**
 * Формирует компактное текстовое представление ComponentInfo.
 * Формат — ключ-значение, по одной строке на элемент.
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
    // Уникальные, preserving order
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
 * Определяет, нужно ли отправлять исходный код в LLM.
 * Файлы ≤ MAX_COMPACT_LINES строк — достаточно сигнатур.
 * Длиннее — нужен код для понимания логики.
 */
export function shouldIncludeCode(code: string): boolean {
  const lineCount = code.split("\n").length;
  return lineCount > MAX_COMPACT_LINES;
}

/**
 * Формирует payload для LLM-промпта:
 * - компактный AST (всегда)
 * - исходный код (только если shouldIncludeCode)
 *
 * Возвращает объект с полями для подстановки в промпт.
 */
export function buildPromptPayload(info: ComponentInfo, code: string): {
  AST_INFO: string;
  CODE: string;
} {
  const compactAst = toCompactAst(info);
  const includeCode = shouldIncludeCode(code);

  return {
    AST_INFO: compactAst,
    CODE: includeCode ? code : "(код опущен — см. AST-сигнатуры выше)",
  };
}
