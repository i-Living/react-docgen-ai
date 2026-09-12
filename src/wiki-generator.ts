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
import { shouldIncludeCode } from "./ast/compact-format.js";
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
  return wikiKebab(name);
}

/**
 * Returns today's date in YYYY-MM-DD format.
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * First prose line of LLM wiki text for index.md.
 * Skips leftover markdown headings so the catalog is not "## Description".
 */
export function extractIndexSummary(doc: string): string {
  const withoutH1 = doc.replace(/^#\s+.+$/m, "").trim();
  for (const raw of withoutH1.split("\n")) {
    const line = raw.trim().replace(/^\*{1,2}|\*{1,2}$/g, "").trim();
    if (!line || /^#{1,6}\s/.test(line)) continue;
    return line.slice(0, 120);
  }
  return "";
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

/** Wiki entity id = source filename without extension (`client.ts` → `client`). */
export function wikiEntityName(file: string): string {
  return path.basename(file, path.extname(file));
}

/** kebab-case including CamelCase split (`CheckoutForm` → `checkout-form`). */
export function wikiKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown";
}

function wikiAliases(pageName: string, astName: string | null): string[] {
  const aliases = new Set<string>([pageName, wikiKebab(pageName)]);
  if (astName) {
    aliases.add(astName);
    aliases.add(wikiKebab(astName));
  }
  return [...aliases];
}

function resolveWikiLink(name: string, pageByAlias: Map<string, string>): string | undefined {
  return pageByAlias.get(name) ?? pageByAlias.get(wikiKebab(name));
}
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

const PRIMITIVE_MAX_LINES = 80;
const QUERY_RE = /\buse(Query|Mutation|InfiniteQuery|SuspenseQuery)\b/;
const QUERY_STATE_RE = /\b(isPending|queryKey)\b/;
const ROUTER_RE = /\b(createBrowserRouter|createHashRouter|createMemoryRouter)\b/;
const UI_KIT_RE = /\b(cva\s*\(|class-variance-authority|@radix-ui\/)/;

/**
 * Confidence follows whether the LLM saw source, not JSX tag count.
 */
export function estimateConfidence(opts: { codeIncluded: boolean; llmOk: boolean }): WikiFrontmatter["confidence"] {
  if (!opts.llmOk) return "low";
  if (opts.codeIncluded) return "high";
  return "medium";
}

/**
 * Thin UI wrappers (shadcn/radix/cva, files under /ui/) are a map-noise.
 * Hooks, stores, routers, query gates, and files over PRIMITIVE_MAX_LINES stay.
 */
export function isPrimitiveUi(info: ComponentInfo, code: string, file = ""): boolean {
  if (info.fileType === "hook" || info.fileType === "store" || info.fileType === "context" || info.fileType === "types") {
    return false;
  }
  if (info.state.length > 0 || info.effects.length > 0 || info.hasStore || info.hasContext) return false;
  if (code.split("\n").length > PRIMITIVE_MAX_LINES) return false;
  if (QUERY_RE.test(code) || QUERY_STATE_RE.test(code) || ROUTER_RE.test(code)) return false;

  const inUiDir = /(?:^|\/)ui\//.test(file.replace(/\\/g, "/"));
  const uiKit = UI_KIT_RE.test(code);
  const uniqueJsx = [...new Set(info.jsxTree)];
  const customJsx = uniqueJsx.filter((n) => {
    if (!/^[A-Z]/.test(n)) return false;
    if (n === "Slot" || n === "Fragment" || n === "Comp") return false;
    if (n.endsWith("Primitive")) return false;
    return true;
  });
  const htmlOrSlotOnly = uniqueJsx.length > 0 && customJsx.length === 0;

  if (info.fileType === "util") return uiKit || inUiDir;
  if (info.fileType !== "component") return false;
  return htmlOrSlotOnly || uiKit || inUiDir;
}

/** Frontmatter `source:` path, or null. */
export function readWikiSource(content: string): string | null {
  const match = content.match(/^source:\s+(\S+)/m);
  return match?.[1] ?? null;
}

/**
 * Archive only when the source file is gone or this run skipped it as a primitive.
 * A rename (source still exists, different slug) is not an archive.
 */
export function shouldArchiveWikiPage(args: {
  sourceFromPage: string | null;
  sourceExists: boolean;
  skippedAsPrimitive: boolean;
}): boolean {
  if (args.skippedAsPrimitive) return true;
  if (!args.sourceFromPage) return false;
  return !args.sourceExists;
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
  codeIncluded: boolean;
};

/**
 * Builds component graph directly from extracted FileData.
 * Avoids re-parsing AST — uses astInfo.jsxTree.
 */
function buildGraphFromData(fileDataList: FileData[]): ComponentGraph {
  const pageByAlias = new Map<string, string>();
  for (const data of fileDataList) {
    for (const alias of wikiAliases(data.componentName, data.astInfo.name)) {
      pageByAlias.set(alias, data.componentName);
    }
  }
  const graph: ComponentGraph = {};
  for (const data of fileDataList) {
    const childComponents = unique(
      data.astInfo.jsxTree
        .filter((c: string) => /^[A-Z]/.test(c) && /[a-z]/.test(c))
        .map((c) => resolveWikiLink(c, pageByAlias))
        .filter((c): c is string => Boolean(c) && c !== data.componentName),
    );
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
  const primitiveSources = new Set<string>();

  // Use parallel pipeline for documentation
  await processFilesConcurrent(files, async (file, index) => {
    const code: string = readFile(file);
    const astInfo = extractComponentInfo(code);
    const componentName = wikiEntityName(file);
    const currentHash = hashContent(code);

    // Skip files without useful content (barrel files, empty, re-exports only)
    if (astInfo.fileType === "skip") {
      return { file, success: true, skipped: true, skipReason: "empty", outputPath: entitiesDir };
    }

    if (isPrimitiveUi(astInfo, code, file)) {
      primitiveSources.add(file);
      return { file, success: true, skipped: true, skipReason: "primitive", outputPath: entitiesDir };
    }

    const codeIncluded = shouldIncludeCode(code);

    // Incrementality: check existing page hash
    const pageSlug = slugify(componentName) + ".md";
    const pagePath = path.join(entitiesDir, pageSlug);
    if (!opts.force && fs.existsSync(pagePath)) {
      const existingContent = fs.readFileSync(pagePath, "utf-8");
      const existingHash = extractWikiHash(existingContent);
      if (existingHash === currentHash) {
        // Hash matches — reuse existing documentation without LLM call
        const oldDoc = extractWikiBody(existingContent);
        fileDataList.push({ file, code, astInfo, componentName, doc: oldDoc, success: true, hash: currentHash, codeIncluded });
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

    fileDataList.push({ file, code, astInfo, componentName, doc, success, hash: currentHash, codeIncluded });

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
      tags: [data.astInfo.fileType, data.astInfo.exportsComponent ? "exported" : "internal"],
      source: data.file,
      confidence: estimateConfidence({ codeIncluded: data.codeIncluded, llmOk: data.success }),
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
    const firstLine = extractIndexSummary(data.doc);

    pagesForIndex.push({
      name: pageName,
      summary: firstLine,
      file: data.file,
    });
  }

  // === Step 5: Archive removed pages (source gone or skipped as primitive; not renames) ===
  const archivedPages: string[] = [];
  for (const existing of existingPages) {
    if (currentPages.has(existing)) continue;
    const oldPath = path.join(entitiesDir, slugify(existing) + ".md");
    if (!fs.existsSync(oldPath)) continue;
    const existingContent = fs.readFileSync(oldPath, "utf-8");
    const sourceFromPage = readWikiSource(existingContent);
    const resolvedSource = sourceFromPage
      ? (path.isAbsolute(sourceFromPage) ? sourceFromPage : path.resolve(sourceFromPage))
      : null;
    const sourceExists = resolvedSource ? fs.existsSync(resolvedSource) : false;
    const skippedAsPrimitive = sourceFromPage != null && (
      primitiveSources.has(sourceFromPage) || (resolvedSource != null && primitiveSources.has(resolvedSource))
    );
    if (!shouldArchiveWikiPage({ sourceFromPage, sourceExists, skippedAsPrimitive })) continue;
    const archiveDir = path.join(wikiDir, "_archive", ENTITIES_DIR);
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.renameSync(oldPath, path.join(archiveDir, slugify(existing) + ".md"));
    archivedPages.push(existing);
  }

  // === Step 6: Write index.md ===
  const indexContent = buildIndex(pagesForIndex);
  fs.writeFileSync(path.join(wikiDir, INDEX_FILE), indexContent, "utf-8");

  // === Step 7: Write log.md ===
  updateLog(wikiDir, createdPages, updatedPages, archivedPages);

  // === Step 8: Sync AGENTS.md / CLAUDE.md project root file ===
  if (!opts.dryRun) {
    // Determine target project root from src path
    const srcAbs = path.resolve(process.cwd(), opts.src);
    const projectRoot = path.basename(srcAbs) === "src" ? path.dirname(srcAbs) : srcAbs;
    updateAgentsMd(wikiDir, projectRoot);
  }

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

// ── AGENTS.md / CLAUDE.md sync ──────────────────────────────────────────────

/** Candidate filenames in priority order */
const AGENT_FILES = ["AGENTS.md", "CLAUDE.md", "agent.md"];

/** Start marker — everything between this and wiki-end is managed by the tool */
const WIKI_MARKER_START = "<!-- wiki-start -->";
/** End marker */
const WIKI_MARKER_END = "<!-- wiki-end -->";

/**
 * Updates (or creates) a reference to the wiki in the project root agent file.
 *
 * Looks for AGENTS.md, CLAUDE.md, or agent.md (in that order) inside projectRoot.
 * If the file exists and contains the wiki markers — replaces the block in-place.
 * If the file exists but no markers — appends the block at the end.
 * If no agent file exists — creates AGENTS.md with the block.
 *
 * The block between markers is owned by the tool and can be safely replaced
 * on every run without duplicating or breaking user content.
 */
function updateAgentsMd(wikiDir: string, projectRoot: string): void {
  // Find which agent file to use
  let targetFile: string | null = null;
  for (const name of AGENT_FILES) {
    const fp = path.join(projectRoot, name);
    if (fs.existsSync(fp)) {
      targetFile = fp;
      break;
    }
  }

  // Build relative path from project root to wiki
  const relWiki = path.relative(projectRoot, wikiDir).replace(/\\/g, "/") || ".";

  const block = `${WIKI_MARKER_START}
## Wiki Documentation

The project has an [LLM Wiki](${relWiki}/) — a map of non-trivial modules, not a second copy of the source.

**For the agent:**

1. Orient from \`${relWiki}/index.md\`. Open one \`${relWiki}/entities/\` page for the module you are changing — do not load the whole wiki.
2. If wiki and code disagree, trust the code (and \`docs/INTEGRATION.md\` if present).
3. Do not regenerate the wiki unless asked. Do not update wiki pages for every prop change.

Key files:
- \`${relWiki}/index.md\` — catalog
- \`${relWiki}/entities/\` — pages for non-trivial modules
- \`${relWiki}/log.md\` — change history
${WIKI_MARKER_END}`;

  if (targetFile) {
    let content = fs.readFileSync(targetFile, "utf-8");
    const startIdx = content.indexOf(WIKI_MARKER_START);
    const endIdx = content.indexOf(WIKI_MARKER_END);

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      // Replace existing block
      const before = content.slice(0, startIdx);
      const after = content.slice(endIdx + WIKI_MARKER_END.length);
      content = before + block + after;
    } else {
      // Append at end (with blank line separator)
      content = content.trimEnd() + "\n\n" + block + "\n";
    }
    fs.writeFileSync(targetFile, content, "utf-8");
  } else {
    // Create AGENTS.md in project root
    const newPath = path.join(projectRoot, AGENT_FILES[0]!);
    const content = `# Agent Instructions\n\n${block}\n`;
    fs.writeFileSync(newPath, content, "utf-8");
  }
}
