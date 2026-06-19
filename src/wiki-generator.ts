/**
 * @fileoverview LLM Wiki Generator — Obsidian-compatible documentation (Karpathy-style)
 *
 * Creates a persistent wiki with entity pages for React components,
 * index.md for navigation, log.md for change history, and [[wikilinks]] 
 * for cross-component links.
 */

import fs from "fs";
import path from "path";
import { CliOptions, ComponentInfo } from "./types.js";
import { getFiles, readFile, hashContent, extractWikiHash } from "./file-utils.js";
import { callLlm } from "./llm.js";
import { extractComponentInfo } from "./ast/ast-extractor.js";
import { ComponentGraph } from "./types.js";
import { getDocumentationPrompt, setPromptDirectory } from "./prompt-loader.js";
import { processFilesConcurrent } from "./pipeline.js";

/** Index file name */
const INDEX_FILE = "index.md";
/** Log file name */
const LOG_FILE = "log.md";
/** Directory for component pages */
const ENTITIES_DIR = "entities";

/** Frontmatter for wiki component page */
interface WikiFrontmatter {
  title: string;
  created: string;
  updated: string;
  type: "entity";
  tags: string[];
  source: string;
  confidence: "high" | "medium" | "low";
  hash: string;
}

/**
 * Generates YAML frontmatter from object.
 */
function toFrontmatter(fm: WikiFrontmatter): string {
  const tags = fm.tags.map((t) => `  - ${t}`).join("\n");
  return `---\ntitle: ${fm.title}\ncreated: ${fm.created}\nupdated: ${fm.updated}\ntype: ${fm.type}\ntags:\n${tags}\nsource: ${fm.source}\nconfidence: ${fm.confidence}\nhash: ${fm.hash}\n---`;
}

/**
 * Extracts wiki page body (without YAML frontmatter).
 * Strictly detects frontmatter: starts with `---` on first line,
 * ends with the next `---` on its own line.
 * Used during hash-match to reuse existing documentation.
 */
function extractWikiBody(content: string): string {
  const lines = content.split("\n");
  // Frontmatter must start with --- on first line
  if (lines[0]?.trim() !== "---") return content;
  // Look for closing --- (line consisting only of ---)
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      return lines.slice(i + 1).join("\n").trim();
    }
  }
  // No closing --- — return as is
  return content;
}

/**
 * Normalizes file name: kebab-case, no special characters.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown";
}

/**
 * Returns today's date in YYYY-MM-DD format.
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Builds wiki content for a component.
 */
function buildWikiContent(
  docMd: string,
  fm: WikiFrontmatter,
  componentName: string,
  children: string[],
  parentNames: string[],
): string {
  const header = toFrontmatter(fm);

  // Links section
  const links: string[] = [];
  if (parentNames.length > 0) {
    links.push("## Used in\n");
    for (const p of parentNames) {
      links.push(`- [[${p}]]`);
    }
    links.push("");
  }
  if (children.length > 0) {
    links.push("## Uses\n");
    for (const c of children) {
      links.push(`- [[${c}]]`);
    }
    links.push("");
  }

  // Main content: remove H1 header from LLM documentation
  // and replace with relative path to source
  const body = docMd.replace(/^#\s+.+$/m, "").trim();

  return `${header}\n\n# ${componentName}\n\n> Source: \`${fm.source}\`\n\n${links.join("\n")}\n${body}\n`;
}

/**
 * Calculates confidence based on export count and JSX elements.
 */
function estimateConfidence(info: ComponentInfo): WikiFrontmatter["confidence"] {
  if (info.exportsComponent && info.jsxTree.length > 2) return "high";
  if (info.exportsComponent) return "medium";
  return "low";
}

/** File data collected for wiki generation */
type FileData = {
  file: string;
  code: string;
  astInfo: ComponentInfo;
  componentName: string;
  doc: string;
  success: boolean;
  hash: string;
};

/**
 * Builds component graph directly from extracted FileData.
 * Avoids re-parsing AST — uses astInfo.jsxTree.
 */
function buildGraphFromData(fileDataList: FileData[]): ComponentGraph {
  const graph: ComponentGraph = {};
  for (const data of fileDataList) {
    if (!data.astInfo.exportsComponent) continue;
    const childComponents = data.astInfo.jsxTree.filter((c: string) => /^[A-Z]/.test(c));
    graph[data.componentName] = {
      file: data.file,
      children: childComponents,
    };
  }
  return graph;
}

// ── Persistent state tracking ──────────────────────────────────────────────

/**
 * Reads list of existing pages from entities/ directory.
 * More reliable than parsing [[wikilinks]] from index.md —
 * does not capture false links from summary text.
 */
function readExistingPages(wikiDir: string): Set<string> {
  const entitiesDir = path.join(wikiDir, ENTITIES_DIR);
  if (!fs.existsSync(entitiesDir)) return new Set();

  const existing = new Set<string>();
  const files = fs.readdirSync(entitiesDir);
  for (const file of files) {
    if (file.endsWith(".md")) {
      // Page name = file name without extension (slug → original name is lost,
      // but for comparison with currentPages use componentName, which is also slugified)
      const pageName = file.replace(/\.md$/, "");
      existing.add(pageName);
    }
  }
  return existing;
}

/**
 * Generates index.md.
 */
function buildIndex(
  pages: Array<{ name: string; summary: string; file: string }>,
): string {
  const lines = [
    "# Wiki Index\n",
    "> Project Component Catalog.",
    "> Last updated: " + today(),
    `> Total pages: ${pages.length}\n`,
    "## Entities\n",
  ];

  // Sort by name
  const sorted = [...pages].sort((a, b) => a.name.localeCompare(b.name));
  for (const p of sorted) {
    const summary = p.summary ? ` — ${p.summary}` : "";
    lines.push(`- [[${p.name}]]${summary}`);
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Updates log.md — adds entry for the current run.
 */
function updateLog(wikiDir: string, created: string[], updated: string[], archived: string[]): void {
  const logFile = path.join(wikiDir, LOG_FILE);
  const existing = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf-8") : "";
  
  const date = today();
  const entries: string[] = [];

  if (created.length > 0) {
    entries.push(`  - Created: ${created.join(", ")}`);
  }
  if (updated.length > 0) {
    entries.push(`  - Updated: ${updated.join(", ")}`);
  }
  if (archived.length > 0) {
    entries.push(`  - Archived: ${archived.join(", ")}`);
  }

  const entry = `## [${date}] wiki-update | ${created.length + updated.length} files processed\n${entries.join("\n")}\n`;
  
  // Check if there's already an entry for today
  const todayMark = `## [${date}]`;
  if (existing.includes(todayMark)) {
    // Replace the latest entry for today
    const lines = existing.split("\n");
    const todayIdx = lines.slice().reverse().findIndex((l: string) => l.startsWith(todayMark));
    if (todayIdx >= 0) {
      const actualIdx = lines.length - 1 - todayIdx;
      lines.splice(actualIdx, lines.length - actualIdx, entry.trimEnd());
      fs.writeFileSync(logFile, lines.join("\n"));
      return;
    }
  }

  // Initialization or append
  if (!existing.trim()) {
    fs.writeFileSync(logFile, `# Wiki Log\n\n> Documentation change history.\n\n${entry}`);
  } else {
    fs.writeFileSync(logFile, existing.trimEnd() + "\n\n" + entry);
  }
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Generates LLM Wiki for React project components.
 *
 * @param opts - CLI options
 * @param wikiDir - Wiki directory (from --wiki)
 */
export async function generateWiki(opts: CliOptions, wikiDir: string): Promise<void> {
  // Apply custom prompt directory if specified
  if (opts.promptDir) {
    setPromptDirectory(opts.promptDir);
  }

  // Create wiki directory structure
  const entitiesDir = path.join(wikiDir, ENTITIES_DIR);
  fs.mkdirSync(entitiesDir, { recursive: true });

  const files: string[] = await getFiles(opts.src, opts.extensions);
  const total = files.length;

  if (total === 0) {
    if (!opts.quiet) console.log("\n⚠️ No files to process (Wiki)");
    return;
  }

  // === Step 1: Get documentation from LLM (parallel) ===
  if (!opts.quiet) console.log(`\n📖 Wiki generation: ${total} files`);

  // Collect data: for each file — code, AST, documentation
  const fileDataList: FileData[] = [];

  // Use parallel pipeline for documentation
  await processFilesConcurrent(files, async (file, index) => {
    const code: string = readFile(file);
    const astInfo = extractComponentInfo(code);
    const componentName = astInfo.name || path.basename(file, path.extname(file));
    const currentHash = hashContent(code);

    // Skip files without useful content (barrel files, empty, re-exports only)
    if (astInfo.fileType === "skip") {
      return { file, success: true, skipped: true, outputPath: entitiesDir };
    }

    if (!astInfo.exportsComponent) {
      // Even for non-exported files, create wiki page but confidence = low
    }

    // Incrementality: check existing page hash
    const pageSlug = slugify(componentName) + ".md";
    const pagePath = path.join(entitiesDir, pageSlug);
    if (!opts.force && fs.existsSync(pagePath)) {
      const existingContent = fs.readFileSync(pagePath, "utf-8");
      const existingHash = extractWikiHash(existingContent);
      if (existingHash === currentHash) {
        // Hash matches — reuse existing documentation without LLM call
        const oldDoc = extractWikiBody(existingContent);
        fileDataList.push({ file, code, astInfo, componentName, doc: oldDoc, success: true, hash: currentHash });
        return { file, success: true, skipped: true, skipReason: "hash-match", outputPath: entitiesDir };
      }
    }

    // Get LLM documentation
    const prompt = getDocumentationPrompt(astInfo, code);
    let doc = "";
    let success = false;

    try {
      doc = await callLlm(opts, prompt);
      success = true;
    } catch (err) {
      if (opts.verbose) console.log(`  ⚠️ Wiki LLM error for ${file}: ${(err as Error)?.message}`);
      doc = `Component **${componentName}**.\n\n*Documentation was not generated (LLM error).*`;
    }

    fileDataList.push({ file, code, astInfo, componentName, doc, success, hash: currentHash });

    return { file, success, outputPath: entitiesDir };
  }, opts, "Wiki generation");

  // === Step 2: Build component graph for cross-references ===
  // Graph built directly from extracted astInfo — no re-parsing
  const graph = buildGraphFromData(fileDataList);

  // === Step 3: Determine which pages already exist ===
  const existingPages = readExistingPages(wikiDir);

  // === Step 4: Write wiki pages ===
  const createdPages: string[] = [];
  const updatedPages: string[] = [];
  const currentPages = new Set<string>();

  const pagesForIndex: Array<{ name: string; summary: string; file: string }> = [];

  for (const data of fileDataList) {
    const pageName = data.componentName;
    const pageSlug = slugify(pageName) + ".md";
    const pagePath = path.join(entitiesDir, pageSlug);
    currentPages.add(slugify(pageName));

    // Children and parents from graph
    const node = graph[pageName];
    const children = node?.children ?? [];
    const parentNames = Object.entries(graph)
      .filter(([, n]) => n.children.includes(pageName))
      .map(([name]) => name);

    // frontmatter
    const fm: WikiFrontmatter = {
      title: pageName,
      created: existingPages.has(slugify(pageName)) ? getFileDate(pagePath, "created") : today(),
      updated: today(),
      type: "entity",
      tags: ["component", data.astInfo.exportsComponent ? "exported" : "internal"],
      source: data.file,
      confidence: estimateConfidence(data.astInfo),
      hash: data.hash,
    };

    // Build content
    const content = buildWikiContent(
      data.doc,
      fm,
      pageName,
      children,
      parentNames,
    );

    fs.writeFileSync(pagePath, content, "utf-8");

    if (existingPages.has(slugify(pageName))) {
      updatedPages.push(pageName);
    } else {
      createdPages.push(pageName);
    }

    // Extract summary from first sentence of LLM documentation
    const firstLine = data.doc
      .replace(/^#\s+.+/m, "")
      .trim()
      .split("\n")[0]
      ?.replace(/^\*{1,2}|\*{1,2}$/g, "")
      .trim()
      .slice(0, 120) || "";

    pagesForIndex.push({
      name: pageName,
      summary: firstLine,
      file: data.file,
    });
  }

  // === Step 5: Archive removed pages ===
  const archivedPages: string[] = [];
  for (const existing of existingPages) {
    if (!currentPages.has(existing)) {
      const oldPath = path.join(entitiesDir, slugify(existing) + ".md");
      if (fs.existsSync(oldPath)) {
        const archiveDir = path.join(wikiDir, "_archive", ENTITIES_DIR);
        fs.mkdirSync(archiveDir, { recursive: true });
        fs.renameSync(oldPath, path.join(archiveDir, slugify(existing) + ".md"));
        archivedPages.push(existing);
      }
    }
  }

  // === Step 6: Write index.md ===
  const indexContent = buildIndex(pagesForIndex);
  fs.writeFileSync(path.join(wikiDir, INDEX_FILE), indexContent, "utf-8");

  // === Step 7: Write log.md ===
  updateLog(wikiDir, createdPages, updatedPages, archivedPages);

  // === Summary ===
  if (opts.verbose) {
    console.log(`\n✨ Wiki generated in ${wikiDir}`);
    console.log(`  📄 ${createdPages.length} created, ${updatedPages.length} updated`);
    if (archivedPages.length > 0) {
      console.log(`  🗄️ ${archivedPages.length} archived`);
    }
  }
}

/**
 * Reads creation date from existing frontmatter file.
 */
function getFileDate(filePath: string, field: "created" | "updated"): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const match = content.match(new RegExp(`${field}:\\s*(\\S+)`));
    return match?.[1] ?? today();
  } catch {
    return today();
  }
}
