/**
 * @fileoverview Module for loading and processing LLM prompts
 * @author AI Docgen
 * @version 1.0.0
 */

import fs from "fs";
import path from "path";
import { FileType } from "./types.js";
import { buildPromptPayload, toCompactAst } from "./ast/compact-format.js";

let _promptDirOverride: string | null = null;

/**
 * Sets custom prompt directory (from --prompt-dir).
 */
export function setPromptDirectory(dir: string): void {
  _promptDirOverride = dir;
}

/**
 * Resets custom prompt directory.
 */
export function resetPromptDirectory(): void {
  _promptDirOverride = null;
}

// Get base prompt directory
const getPromptsDirectory = (): string => {
  // 1. If custom directory is set via --prompt-dir
  if (_promptDirOverride && fs.existsSync(_promptDirOverride)) {
    return _promptDirOverride;
  }

  // Check multiple possible paths in priority order
  const possiblePaths = [
    // 2. Relative to source code (for development and testing)
    path.join(process.cwd(), 'src', 'prompts'),
    // 3. Relative to compiled code (for production)
    path.join(process.cwd(), 'dist', 'prompts')
  ];

  // Also check paths relative to current module (if available)
  try {
    const currentDir = __dirname;
    const moduleBasedPaths = [
      path.join(currentDir, 'prompts'),
      path.join(currentDir, '..', 'prompts'),
      path.join(currentDir, '..', '..', 'src', 'prompts'),
      path.join(currentDir, '..', '..', 'dist', 'prompts')
    ];
    
    possiblePaths.push(...moduleBasedPaths);
  } catch (error) {
    // Ignore __dirname errors
  }
  
  // Find first existing path
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      return testPath;
    }
  }
  
  // If nothing found, return default path
  return path.join(process.cwd(), 'src', 'prompts');
};

/**
 * Loads prompt from file and replaces placeholders
 * @param promptName - Prompt file name (without extension)
 * @param replacements - Object with placeholder replacements
 * @returns Complete prompt with substituted values
 */
export function loadPrompt(promptName: string, replacements: Record<string, string>): string {
  const promptPath = path.join(getPromptsDirectory(), `${promptName}.txt`);
  
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  
  let prompt = fs.readFileSync(promptPath, "utf8");
  
  // Replace all {{KEY}} placeholders with values
  for (const [key, value] of Object.entries(replacements)) {
    // Replace with simple string to avoid regex issues
    const placeholder = `{{${key}}}`;
    prompt = prompt.split(placeholder).join(value);
  }
  
  return prompt;
}

/**
 * Loads prompt for annotation.
 * Uses compact AST format instead of JSON (saves tokens).
 * Note: for annotation, code is always passed in full.
 * @param astInfo - Component information from AST
 * @param code - Component source code
 * @returns Complete prompt for annotation
 */
export function getAnnotationPrompt(astInfo: any, code: string): string {
  const compactAst = toCompactAst(astInfo);
  return loadPrompt("annotation", {
    AST_INFO: compactAst,
    CODE: code
  });
}

/**
 * FileType → prompt file name mapping.
 * If type is unknown — fallback to component.
 */
const PROMPT_BY_TYPE: Record<FileType, string> = {
  component: "component",
  hook: "hook",
  context: "context",
  store: "store",
  util: "util",
  types: "types",
  skip: "component", // unused (skip files filtered earlier)
};

/**
 * Loads type-specific prompt for documentation generation.
 * Selects prompt file based on astInfo.fileType.
 * Uses compact AST format instead of JSON. Source is included unless the file is extremely long.
 * @param astInfo - Component information from AST (with fileType field)
 * @param code - Component source code
 * @returns Complete prompt with substituted values
 */
export function getDocumentationPrompt(astInfo: any, code: string): string {
  const fileType: FileType = astInfo.fileType ?? "component";
  const promptName = PROMPT_BY_TYPE[fileType] ?? "component";
  const payload = buildPromptPayload(astInfo, code);

  return loadPrompt(promptName, {
    AST_INFO: payload.AST_INFO,
    CODE: payload.CODE,
  });
}
