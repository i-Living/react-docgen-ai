/**
 * @fileoverview Module for automatically adding comments to React code
 * @author AI Docgen
 * @version 1.0.0
 */

import { getFiles, readFile, writeOutput, writeInPlace, hasFileoverview, removeComments, hasCodeChanges } from "./file-utils.js";
import { callLlm } from "./llm.js";
import { extractComponentInfo } from "./ast/ast-extractor.js";
import { getAnnotationPrompt, setPromptDirectory } from "./prompt-loader.js";
import { toCompactAst } from "./ast/compact-format.js";
import { CliOptions } from "./types.js";
import { processFilesConcurrent } from "./pipeline.js";

/** Annotation modes */
type AnnotationMode = 'copy' | 'inplace';

/**
 * Creates a strict prompt for annotation retry attempts.
 * Warnings are appended to the original prompt once, without accumulation.
 */
function makePromptStrict(originalPrompt: string, attemptNumber: number): string {
  const warnings = [
    `=== ATTEMPT ${attemptNumber}/3 — STRICT WARNING ===`,
    "DO NOT change source code! DO NOT shorten with (...)!",
    "DO NOT DELETE/TRIM code parts! RETURN FULL code with comments!",
    "Forbidden: changing JSX/props/state/imports/exports, adding eslint-disable",
    "Allowed: only adding JSDoc /** */ before functions + @fileoverview",
    "=== END OF WARNING ===\n",
  ];

  return warnings.join("\n") + originalPrompt;
}

/**
 * General annotation logic for React components
 * @param opts - CLI options
 * @param mode - Mode: 'copy' (to output folder) or 'inplace' (directly into files)
 */
async function annotateFiles(opts: CliOptions, mode: AnnotationMode): Promise<void> {
  try {
    // Apply custom prompt directory if specified
    if (opts.promptDir) {
      setPromptDirectory(opts.promptDir);
    }

    const files: string[] = await getFiles(opts.src, opts.extensions);
    const modeLabel = mode === 'copy' ? 'Annotation (copy)' : 'Annotation (in-place)';

    if (opts.dryRun) {
      if (!opts.quiet) console.log(`\n🧪 [DRY RUN] ${modeLabel}: ${files.length} files`);

      let skipped = 0;
      let processed = 0;
      for (const file of files) {
        const code = readFile(file);
        if (!opts.force && hasFileoverview(code)) {
          if (opts.verbose) console.log(`  ⏭️ [SKIP] has @fileoverview: ${file}`);
          skipped++;
        } else {
          if (!opts.quiet) console.log(`  ✓ Would annotate: ${file}`);
          processed++;
        }
      }
      if (!opts.quiet) console.log(`\n🧪 Dry-run: ${processed} would process, ${skipped} would skip`);
      return;
    }

    await processFilesConcurrent(files, async (file, index, total) => {
      const code: string = readFile(file);

      // Skip files with @fileoverview unless --force is set
      if (!opts.force && hasFileoverview(code)) {
        return { file, success: true, skipped: true, skipReason: "has @fileoverview" };
      }

      // Extract structural info via AST
      const astInfo = extractComponentInfo(code);

      // Skip files without useful content (barrel files, empty, re-exports only)
      if (astInfo.fileType === "skip") {
        return { file, success: true, skipped: true, skipReason: "no-content" };
      }

      // Build detailed prompt for LLM
      const prompt = getAnnotationPrompt(astInfo, code);

      // Generate code with change checking (max 3 attempts)
      const MAX_ATTEMPTS = 3;
      let attempts = 0;
      let annotated: string | null = null;

      while (attempts < MAX_ATTEMPTS) {
        try {
          // On 0th attempt — original prompt, subsequent — strict
          const currentPrompt = attempts === 0
            ? prompt
            : makePromptStrict(prompt, attempts + 1);
          const result: string = await callLlm(opts, currentPrompt);

          // Check if code changed (ignoring comments)
          if (!hasCodeChanges(code, result)) {
            annotated = result;
            break;
          }

          attempts++;
          if (attempts === MAX_ATTEMPTS) {
            return {
              file,
              success: false,
              error: `Code changes detected after ${MAX_ATTEMPTS} attempts (original: ${code.length}, result: ${result.length})`,
            };
          }
        } catch (error) {
          attempts++;
          if (attempts === MAX_ATTEMPTS) {
            return {
              file,
              success: false,
              error: `LLM error after ${MAX_ATTEMPTS} attempts: ${(error as Error)?.message ?? error}`,
            };
          }
        }
      }

      if (!annotated) {
        return { file, success: false, error: "Annotation returned null" };
      }

      // Write result
      if (mode === 'copy') {
        const outPath = writeOutput(opts.out + "/annotated", file, annotated);
        return { file, success: true, outputPath: outPath };
      }

      writeInPlace(file, annotated);
      return { file, success: true, outputPath: file };
    }, opts, modeLabel);
  } catch (error) {
    console.error("❌ Error during annotation:", error);
    throw error;
  }
}

/**
 * Annotates React project components to output directory
 */
export async function annotateProject(opts: CliOptions): Promise<void> {
  return annotateFiles(opts, 'copy');
}

/**
 * Annotates files directly in source files (in-place)
 */
export async function annotateInPlace(opts: CliOptions): Promise<void> {
  return annotateFiles(opts, 'inplace');
}
