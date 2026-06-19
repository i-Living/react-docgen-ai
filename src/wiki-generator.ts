/**
 * @fileoverview Генератор LLM Wiki — Obsidian-совместимая документация в стиле Карпати
 *
 * Создаёт персистентную wiki с entity-страницами для React компонентов,
 * index.md для навигации, log.md для истории изменений и [[wikilinks]] 
 * для связей между компонентами.
 */

import fs from "fs";
import path from "path";
import { CliOptions, ComponentInfo } from "./types.js";
import { getFiles, readFile, hashContent, extractWikiHash } from "./file-utils.js";
import { callLlm } from "./llm.js";
import { extractComponentInfo } from "./ast/ast-extractor.js";
import { buildComponentGraph } from "./ast/component-graph.js";
import { getDocumentationPrompt, setPromptDirectory } from "./prompt-loader.js";
import { processFilesConcurrent } from "./pipeline.js";

/** Имя файла индекса */
const INDEX_FILE = "index.md";
/** Имя файла лога */
const LOG_FILE = "log.md";
/** Директория для страниц компонентов */
const ENTITIES_DIR = "entities";

/** Frontmatter для wiki-страницы компонента */
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
 * Генерирует YAML frontmatter из объекта.
 */
function toFrontmatter(fm: WikiFrontmatter): string {
  const tags = fm.tags.map((t) => `  - ${t}`).join("\n");
  return `---\ntitle: ${fm.title}\ncreated: ${fm.created}\nupdated: ${fm.updated}\ntype: ${fm.type}\ntags:\n${tags}\nsource: ${fm.source}\nconfidence: ${fm.confidence}\nhash: ${fm.hash}\n---`;
}

/**
 * Извлекает тело wiki-страницы (без YAML frontmatter).
 * Используется при hash-match для переиспользования существующей документации.
 */
function extractWikiBody(content: string): string {
  // Убираем frontmatter (--- ... ---)
  const fmEnd = content.indexOf("---\n", content.indexOf("---\n") + 1);
  if (fmEnd === -1) return content;
  return content.slice(fmEnd + 4).trim();
}

/**
 * Нормализует имя файла: kebab-case, без спецсимволов.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "unknown";
}

/**
 * Возвращает сегодняшнюю дату в формате YYYY-MM-DD.
 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Строит wiki-содержимое для компонента.
 */
function buildWikiContent(
  docMd: string,
  fm: WikiFrontmatter,
  componentName: string,
  children: string[],
  parentNames: string[],
): string {
  const header = toFrontmatter(fm);

  // Секция связей
  const links: string[] = [];
  if (parentNames.length > 0) {
    links.push("## Используется в\n");
    for (const p of parentNames) {
      links.push(`- [[${p}]]`);
    }
    links.push("");
  }
  if (children.length > 0) {
    links.push("## Использует компоненты\n");
    for (const c of children) {
      links.push(`- [[${c}]]`);
    }
    links.push("");
  }

  // Основное содержимое: убираем заголовок H1 из LLM-документации
  // и заменяем на относительный путь к исходнику
  const body = docMd.replace(/^#\s+.+$/m, "").trim();

  return `${header}\n\n# ${componentName}\n\n> Исходник: \`${fm.source}\`\n\n${links.join("\n")}\n${body}\n`;
}

/**
 * Вычисляет confidence на основе количества exports и JSX-элементов.
 */
function estimateConfidence(info: ComponentInfo): WikiFrontmatter["confidence"] {
  if (info.exportsComponent && info.jsxTree.length > 2) return "high";
  if (info.exportsComponent) return "medium";
  return "low";
}

// ── Persistent state tracking ──────────────────────────────────────────────

/** Хранит список страниц, которые существовали до этого запуска */
function readExistingPages(wikiDir: string): Set<string> {
  const indexFile = path.join(wikiDir, INDEX_FILE);
  if (!fs.existsSync(indexFile)) return new Set();

  const content = fs.readFileSync(indexFile, "utf-8");
  const existing = new Set<string>();
  // Ищем [[wikilinks]] в index.md — это и есть страницы
  const linkRe = /\[\[([^\]]+)\]\]/g;
  let match;
  while ((match = linkRe.exec(content)) !== null) {
    existing.add(match[1]!);
  }
  return existing;
}

/**
 * Генерирует index.md.
 */
function buildIndex(
  pages: Array<{ name: string; summary: string; file: string }>,
): string {
  const lines = [
    "# Wiki Index\n",
    "> Каталог React компонентов проекта.",
    "> Last updated: " + today(),
    `> Total pages: ${pages.length}\n`,
    "## Entities\n",
  ];

  // Сортируем по имени
  const sorted = [...pages].sort((a, b) => a.name.localeCompare(b.name));
  for (const p of sorted) {
    const summary = p.summary ? ` — ${p.summary}` : "";
    lines.push(`- [[${p.name}]]${summary}`);
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Обновляет log.md — добавляет запись о текущем запуске.
 */
function updateLog(wikiDir: string, created: string[], updated: string[], archived: string[]): void {
  const logFile = path.join(wikiDir, LOG_FILE);
  const existing = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf-8") : "";
  
  const date = today();
  const entries: string[] = [];

  if (created.length > 0) {
    entries.push(`  - Создано: ${created.join(", ")}`);
  }
  if (updated.length > 0) {
    entries.push(`  - Обновлено: ${updated.join(", ")}`);
  }
  if (archived.length > 0) {
    entries.push(`  - Архивировано: ${archived.join(", ")}`);
  }

  const entry = `## [${date}] wiki-update | ${created.length + updated.length} files processed\n${entries.join("\n")}\n`;
  
  // Ищем, есть ли уже запись за сегодня
  const todayMark = `## [${date}]`;
  if (existing.includes(todayMark)) {
    // Заменяем последнюю запись за сегодня
    const lines = existing.split("\n");
    const todayIdx = lines.slice().reverse().findIndex((l: string) => l.startsWith(todayMark));
    if (todayIdx >= 0) {
      const actualIdx = lines.length - 1 - todayIdx;
      lines.splice(actualIdx, lines.length - actualIdx, entry.trimEnd());
      fs.writeFileSync(logFile, lines.join("\n"));
      return;
    }
  }

  // Инициализация или добавление
  if (!existing.trim()) {
    fs.writeFileSync(logFile, `# Wiki Log\n\n> Хронология изменений документации.\n\n${entry}`);
  } else {
    fs.writeFileSync(logFile, existing.trimEnd() + "\n\n" + entry);
  }
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Генерирует LLM Wiki для React компонентов проекта.
 *
 * @param opts - Опции CLI
 * @param wikiDir - Директория wiki (из --wiki)
 */
export async function generateWiki(opts: CliOptions, wikiDir: string): Promise<void> {
  // Применяем кастомную директорию промптов если указана
  if (opts.promptDir) {
    setPromptDirectory(opts.promptDir);
  }

  // Создаём структуру wiki
  const entitiesDir = path.join(wikiDir, ENTITIES_DIR);
  fs.mkdirSync(entitiesDir, { recursive: true });

  const files: string[] = await getFiles(opts.src, opts.extensions);
  const total = files.length;

  if (total === 0) {
    console.log("\n⚠️ Нет файлов для обработки (Wiki)");
    return;
  }

  // === Шаг 1: Получаем документацию от LLM (параллельно) ===
  console.log(`\n📖 Wiki generation: ${total} files`);

  // Собираем данные: для каждого файла — код, AST, документация
  type FileData = {
    file: string;
    code: string;
    astInfo: ComponentInfo;
    componentName: string;
    doc: string;
    success: boolean;
    hash: string;
  };

  const fileDataList: FileData[] = [];

  // Используем параллельный пайплайн для получения документации
  await processFilesConcurrent(files, async (file, index) => {
    const code: string = readFile(file);
    const astInfo = extractComponentInfo(code);
    const componentName = astInfo.name || path.basename(file, path.extname(file));
    const currentHash = hashContent(code);

    // Skip файлы без полезного содержимого (barrel files, пустые, re-exports only)
    if (astInfo.fileType === "skip") {
      return { file, success: true, skipped: true, outputPath: entitiesDir };
    }

    if (!astInfo.exportsComponent) {
      // Даже для неэкспортируемых файлов создаём wiki-страницу, но confidence = low
    }

    // Инкрементальность: проверяем хэш существующей страницы
    const pageSlug = slugify(componentName) + ".md";
    const pagePath = path.join(entitiesDir, pageSlug);
    if (!opts.force && fs.existsSync(pagePath)) {
      const existingContent = fs.readFileSync(pagePath, "utf-8");
      const existingHash = extractWikiHash(existingContent);
      if (existingHash === currentHash) {
        // Хэш совпадает — переиспользуем существующую документацию без LLM-вызова
        const oldDoc = extractWikiBody(existingContent);
        fileDataList.push({ file, code, astInfo, componentName, doc: oldDoc, success: true, hash: currentHash });
        return { file, success: true, skipped: true, skipReason: "hash-match", outputPath: entitiesDir };
      }
    }

    // Получаем LLM-документацию
    const prompt = getDocumentationPrompt(astInfo, code);
    let doc = "";
    let success = false;

    try {
      doc = await callLlm(opts, prompt);
      success = true;
    } catch (err) {
      console.log(`  ⚠️ Wiki LLM error for ${file}: ${(err as Error)?.message}`);
      doc = `Компонент **${componentName}**.\n\n*Документация не сгенерирована (LLM error).*`;
    }

    fileDataList.push({ file, code, astInfo, componentName, doc, success, hash: currentHash });

    return { file, success, outputPath: entitiesDir };
  }, opts, "Wiki generation");

  // === Шаг 2: Строим граф компонентов для перекрёстных ссылок ===
  const graph = buildComponentGraph(
    fileDataList.map((d) => ({ path: d.file, content: d.code })),
  );

  // === Шаг 3: Определяем, какие страницы уже существуют ===
  const existingPages = readExistingPages(wikiDir);

  // === Шаг 4: Записываем wiki-страницы ===
  const createdPages: string[] = [];
  const updatedPages: string[] = [];
  const currentPages = new Set<string>();

  const pagesForIndex: Array<{ name: string; summary: string; file: string }> = [];

  for (const data of fileDataList) {
    const pageName = data.componentName;
    const pageSlug = slugify(pageName) + ".md";
    const pagePath = path.join(entitiesDir, pageSlug);
    currentPages.add(pageName);

    // Дети и родители из графа
    const node = graph[pageName];
    const children = node?.children ?? [];
    const parentNames = Object.entries(graph)
      .filter(([, n]) => n.children.includes(pageName))
      .map(([name]) => name);

    // frontmatter
    const fm: WikiFrontmatter = {
      title: pageName,
      created: existingPages.has(pageName) ? getFileDate(pagePath, "created") : today(),
      updated: today(),
      type: "entity",
      tags: ["component", data.astInfo.exportsComponent ? "exported" : "internal"],
      source: data.file,
      confidence: estimateConfidence(data.astInfo),
      hash: data.hash,
    };

    // Собираем содержимое
    const content = buildWikiContent(
      data.doc,
      fm,
      pageName,
      children,
      parentNames,
    );

    fs.writeFileSync(pagePath, content, "utf-8");

    if (existingPages.has(pageName)) {
      updatedPages.push(pageName);
    } else {
      createdPages.push(pageName);
    }

    // Извлекаем summary из первого предложения LLM-документации
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

  // === Шаг 5: Архивируем удалённые страницы ===
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

  // === Шаг 6: Пишем index.md ===
  const indexContent = buildIndex(pagesForIndex);
  fs.writeFileSync(path.join(wikiDir, INDEX_FILE), indexContent, "utf-8");

  // === Шаг 7: Пишем log.md ===
  updateLog(wikiDir, createdPages, updatedPages, archivedPages);

  // === Итог ===
  console.log(`\n✨ Wiki generated in ${wikiDir}`);
  console.log(`  📄 ${createdPages.length} created, ${updatedPages.length} updated`);
  if (archivedPages.length > 0) {
    console.log(`  🗄️ ${archivedPages.length} archived`);
  }
}

/**
 * Читает дату создания из существующего frontmatter файла.
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
