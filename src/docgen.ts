/**
 * @fileoverview Module for automatic Markdown/JSON documentation generation of React components
 * @author AI Docgen
 * @version 1.0.0
 */

import { getFiles, readFile, writeOutput, outputFileExists, getDocFiles, deleteFile, readOutputFile, extractDocHash, hashContent } from "./file-utils.js";
import { callLlm } from "./llm.js";
import { extractComponentInfo } from "./ast/ast-extractor.js";
import { getDocumentationPrompt, setPromptDirectory } from "./prompt-loader.js";
import path from "path";
import { CliOptions, OutputFormat } from "./types.js";
import { processFilesConcurrent } from "./pipeline.js";

/**
 * Checks if LLM response is valid documentation
 */
function isValidDocumentation(response: string, format: OutputFormat): boolean {
  if (format === "json") {
    try {
      const parsed = JSON.parse(response);
      return parsed !== null && typeof parsed === "object";
    } catch {
      return false;
    }
  }

  const invalidPatterns = [
    'analysisNeed markdown sections',
    'No props, no state, no effects',
    'Provide description, logic, key features',
    'unable to analyze',
    'cannot generate documentation',
    'no component found',
    'insufficient information'
  ];

  const responseLower = response.toLowerCase();
  for (const pattern of invalidPatterns) {
    if (responseLower.includes(pattern.toLowerCase())) {
      return false;
    }
  }

  const hasMarkdownStructure = 
    response.includes('#') || 
    response.includes('##') ||
    response.includes('###') ||
    response.includes('**');

  const hasMinimumLength = response.trim().length > 50;

  return hasMarkdownStructure && hasMinimumLength;
}

/**
 * Creates a strict prompt for retry documentation generation
 */
function makeDocPromptStrict(originalPrompt: string): string {
  return originalPrompt + "\n\nCRITICAL: Create complete Markdown documentation. DO NOT write error messages. DO NOT ask for additional info. USE data from AST!";
}

/**
 * Generates JSON documentation from LLM markdown response
 */
function convertMdToJson(md: string, fileName: string): string {
  // Extract title from markdown
  const titleMatch = md.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1]!.trim() : fileName;

  // Extract sections
  const sections: Record<string, string> = {};
  const sectionRegex = /^##\s+(.+)$\n([\s\S]*?)(?=\n##\s|\n$)/gm;
  let match;
  while ((match = sectionRegex.exec(md)) !== null) {
    sections[match[1]!.trim()] = match[2]!.trim();
  }

  // General description (everything before first ##)
  const descMatch = md.match(/^#\s+.+$\n([\s\S]*?)(?=\n##\s|\n$)/m);
  const description = descMatch ? descMatch[1]!.trim() : "";

  const doc: Record<string, unknown> = {
    title,
    description,
    sections,
    raw: md,
    generatedAt: new Date().toISOString(),
  };

  return JSON.stringify(doc, null, 2);
}

/**
 * Performs parallel documentation generation for React components
 * Combines AST analysis with LLM for detailed documentation
 * @param opts - CLI options
 */
export async function generateDocs(opts: CliOptions): Promise<void> {
  try {
    // Apply custom prompt directory if specified
    if (opts.promptDir) {
      setPromptDirectory(opts.promptDir);
    }

    const files: string[] = await getFiles(opts.src, opts.extensions);
    const outDir: string = opts.out + "/docs";
    const format: OutputFormat = opts.format ?? "markdown";

    if (opts.dryRun) {
      if (!opts.quiet) console.log(`\n🧪 [DRY RUN] Docgen (${format}): ${files.length} files`);
      for (const file of files) {
        const outFile = file.replace(/\.(js|jsx|ts|tsx)$/, format === "json" ? ".json" : ".md");
        if (!opts.force && outputFileExists(outDir, outFile)) {
          if (opts.verbose) console.log(`  ⏭️ [SKIP] exists: ${outFile}`);
        } else {
          if (!opts.quiet) console.log(`  ✓ Would generate: ${outFile}`);
        }
      }
      if (!opts.quiet) console.log(`\n🧪 Dry-run completed.`);

      // In dry-run, don't delete orphaned docs
      return;
    }

    // Delete stale doc files (with no matching source files)
    await cleanupOrphanedDocs(outDir, files, opts.extensions);

    const label = `Docgen (${format})`;

    await processFilesConcurrent(files, async (file, index, total) => {
      // Determine output documentation file path
      const ext = format === "json" ? ".json" : ".md";
      const outFile: string = file.replace(/\.(js|jsx|ts|tsx)$/, ext);

      // Read component source code
      const code: string = readFile(file);

      // Extract structural info via AST analysis
      const astInfo = extractComponentInfo(code);

      // Skip files without useful content (barrel files, empty, re-exports only)
      if (astInfo.fileType === "skip") {
        return { file, success: true, skipped: true, skipReason: "no-content" };
      }

      // Incrementality: check source hash
      if (!opts.force && outputFileExists(outDir, outFile)) {
        const existingContent = readOutputFile(outDir, outFile);
        const existingHash = existingContent ? extractDocHash(existingContent) : null;
        const currentHash = hashContent(code);
        if (existingHash === currentHash) {
          return { file, success: true, skipped: true, skipReason: "hash-match" };
        }
        // Hash changed — regenerate (fall through to LLM)
      }

      // Build specialized prompt for documentation generation
      const prompt = getDocumentationPrompt(astInfo, code);

      // Request detailed documentation from LLM
      let doc: string = await callLlm(opts, prompt);

      // Response validation — check for bad answers
      if (!isValidDocumentation(doc, format)) {
        // Short delay before retry — possible cause: LLM load
        await new Promise((resolve) => setTimeout(resolve, 500));
        const strictPrompt = makeDocPromptStrict(prompt);
        doc = await callLlm(opts, strictPrompt);
      }

      // For JSON format: convert markdown → JSON
      const outputContent = format === "json"
        ? convertMdToJson(doc, path.basename(file))
        : doc;

      // Add source hash at file start for incrementality
      const contentWithHash = `<!-- docgen-hash: ${hashContent(code)} -->\n${outputContent}`;

      // Write documentation to output file
      const outPath: string = writeOutput(outDir, outFile, contentWithHash);

      return { file, success: true, outputPath: outPath };
    }, opts, label);
  } catch (error) {
    console.error("❌ Error generating documentation:", error);
    throw error;
  }
}

/**
 * Removes doc files with no corresponding source files
 */
async function cleanupOrphanedDocs(docsDir: string, sourceFiles: string[], extensions: string): Promise<void> {
  const docFiles = await getDocFiles(docsDir);

  if (docFiles.length === 0) {
    return;
  }

  // Create set of expected md/json files based on source files
  const expectedDocs = new Set<string>();
  for (const srcFile of sourceFiles) {
    const mdFile = srcFile.replace(/\.(js|jsx|ts|tsx)$/, ".md");
    const jsonFile = srcFile.replace(/\.(js|jsx|ts|tsx)$/, ".json");
    const rel = path.relative(process.cwd(), mdFile);
    const expectedPathMd = path.join(docsDir, rel);
    expectedDocs.add(path.normalize(expectedPathMd));
    const relJson = path.relative(process.cwd(), jsonFile);
    const expectedPathJson = path.join(docsDir, relJson);
    expectedDocs.add(path.normalize(expectedPathJson));
  }

  // Remove doc files not in expected set
  for (const docFile of docFiles) {
    const normalizedDocFile = path.normalize(docFile);
    if (!expectedDocs.has(normalizedDocFile)) {
      deleteFile(docFile);
      console.log("  🗑️ Deleted orphaned doc:", docFile);
    }
  }
}
