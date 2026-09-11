/**
 * @fileoverview File system utilities
 * @author AI Docgen
 * @version 1.0.0
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Recursively finds files with given extensions in a directory
 */
const SKIP_DIRS = new Set(["test", "__tests__", "node_modules", "dist", ".git"]);

function isTestFile(name: string): boolean {
  return /\.(test|spec)\./i.test(name);
}

function findFilesRecursive(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      results.push(...findFilesRecursive(fullPath, extensions));
    } else if (entry.isFile()) {
      if (isTestFile(entry.name)) continue;
      const ext = path.extname(entry.name).substring(1).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Gets list of files to process
 * Supports both directories and single files
 * @param src - Path to source directory or file
 * @param extensions - Comma-separated list of file extensions
 * @returns Promise with array of file paths
 */
export async function getFiles(src: string, extensions: string): Promise<string[]> {
  // Check if path exists and is a file
  const pathExists = fs.existsSync(src);
  if (!pathExists) {
    throw new Error(`Path not found: ${src}`);
  }

  const stats = fs.statSync(src);
  
  // If it's a file, check extension and return immediately
  if (stats.isFile()) {
    return validateAndReturnSingleFile(src, extensions);
  }
  
  // If it's a directory, use recursive file search
  return getFilesFromDirectory(src, extensions);
}

/**
 * Checks and returns a single file
 * @param filePath - File path
 * @param extensions - List of allowed extensions
 * @returns Array with one file if it matches
 */
function validateAndReturnSingleFile(filePath: string, extensions: string): string[] {
  // Split extensions string into array, remove extra spaces
  const exts: string[] = extensions.split(",").map((e: string) => e.trim());
  
  // Get file extension
  const fileExt = path.extname(filePath).substring(1).toLowerCase();
  
  // Check if file extension is in allowed list
  if (!exts.includes(fileExt)) {
    throw new Error(`File extension '.${fileExt}' is not in allowed list: ${extensions}`);
  }
  
  return [filePath];
}

/**
 * Gets list of files from directory by extension
 * @param src - Source directory path
 * @param extensions - Comma-separated list of file extensions
 * @returns Promise with array of file paths
 */
async function getFilesFromDirectory(src: string, extensions: string): Promise<string[]> {
  const exts: string[] = extensions.split(",").map((e: string) => e.trim());
  return findFilesRecursive(src, exts);
}

/**
 * Reads file content
 * @param filePath - File path
 * @returns File content as string
 */
export function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Writes processed content to output directory
 * Preserves directory structure relative to source
 * @param baseOut - Base output directory
 * @param srcFile - Source file path
 * @param content - Content to write
 * @returns Path to created file
 */
export function writeOutput(baseOut: string, srcFile: string, content: string): string {
  // Get relative path from current working directory
  const rel: string = path.relative(process.cwd(), srcFile);
  
  // Build full path for output file
  const outPath: string = path.join(baseOut, rel);
  
  // Create directories if they don't exist
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  
  // Write content to file
  fs.writeFileSync(outPath, content);
  
  return outPath;
}

/**
 * Writes content directly to source file (in-place)
 * @param filePath - File path to overwrite
 * @param content - New content to write
 */
export function writeInPlace(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, "utf8");
}

/**
 * Checks if file contains @fileoverview tag at start
 * @param content - File content
 * @returns true if file contains @fileoverview
 */
export function hasFileoverview(content: string): boolean {
  // Check first 500 characters for @fileoverview
  const header = content.slice(0, 500);
  return /@fileoverview/.test(header);
}

/**
 * Removes all comments from JavaScript/TypeScript code
 * @param code - Source code
 * @returns Code without comments
 */
export function removeComments(code: string): string {
  // Create array for protected strings
  const strings: string[] = [];
  let stringIndex = 0;
  
  let result = code;
  
  // Protect single-quoted strings
  result = result.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, (match) => {
    strings[stringIndex] = match;
    return `__STRING_${stringIndex++}__`;
  });
  
  // Protect double-quoted strings
  result = result.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, (match) => {
    strings[stringIndex] = match;
    return `__STRING_${stringIndex++}__`;
  });
  
  // Protect backtick strings (template literals)
  result = result.replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, (match) => {
    strings[stringIndex] = match;
    return `__STRING_${stringIndex++}__`;
  });
  
  // Protect regex literals from false removal
  // Don't capture // as start of regexp, need at least 1 char between //
  result = result.replace(/\/(?!\*)(?:\[[^\]]*\]|[^\/\\\n]|\\.)+\/[gimsuy]*/g, (match) => {
    strings[stringIndex] = match;
    return `__REGEXP_${stringIndex++}__`;
  });

  // Remove multi-line comments (/* comment */ and /** JSDoc */)
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove single-line comments (// comment) 
  // Don't remove part after // if it's part of URL or protocol
  result = result.replace(/(?:^|[ \t])\/\/.*$/gm, '');
  
  // Restore all protected strings and regexes
  result = result.replace(/__(STRING|REGEXP)_(\d+)__/g, (match, type, index) => {
    return strings[parseInt(index)] || match;
  });
  
  // Remove extra blank lines at file start
  result = result.replace(/^\s*\n/, '');
  
  // Remove multiple consecutive blank lines
  result = result.replace(/\n\s*\n\s*\n+/g, '\n\n');
  // Remove trailing whitespace
  result = result.replace(/\s+$/gm, '');
  // Collapse multiple spaces (keep only 1)
  result = result.replace(/[ \t]+/g, ' ');
  // Normalize line breaks (remove extra spaces around them)
  result = result.replace(/\n\s+/g, '\n');
  // Remove blank lines at start and end
  result = result.trim();
  
  return result;
}

/**
 * Checks if code has changed compared to original
 * @param original - Original code
 * @param modified - Modified code
 * @returns true if code changed (ignoring comments)
 */
export function hasCodeChanges(original: string, modified: string): boolean {
  const originalClean = removeComments(original);
  const modifiedClean = removeComments(modified);
  
  return originalClean !== modifiedClean;
}

// ── Hash-based incrementality ───────────────────────────────────────────────

/**
 * Calculates SHA-256 hash of content (first 16 hex characters).
 * Used for incrementality — if source hash hasn't changed,
 * LLM call is skipped.
 */
export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").substring(0, 16);
}

/**
 * Extracts hash from wiki page YAML frontmatter.
 * Format: `hash: abc123`
 * @returns Hash or null if field not found
 */
export function extractWikiHash(content: string): string | null {
  const match = content.match(/^hash:\s*([a-f0-9]+)/m);
  return match?.[1] ?? null;
}
