/**
 * @fileoverview Модуль для автоматической генерации Markdown/JSON документации React компонентов
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
 * Проверяет, является ли ответ LLM валидной документацией
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
 * Формирует строгий промпт для повторной попытки генерации документации
 */
function makeDocPromptStrict(originalPrompt: string): string {
  return originalPrompt + "\n\nКРИТИЧЕСКИ ВАЖНО: Создай полную Markdown документацию. НЕ пиши сообщения об ошибках. НЕ проси дополнительную информацию. ИСПОЛЬЗУЙ данные из AST!";
}

/**
 * Генерирует JSON-документацию из markdown-ответа LLM
 */
function convertMdToJson(md: string, fileName: string): string {
  // Извлекаем заголовок из markdown
  const titleMatch = md.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1]!.trim() : fileName;

  // Извлекаем секции
  const sections: Record<string, string> = {};
  const sectionRegex = /^##\s+(.+)$\n([\s\S]*?)(?=\n##\s|\n$)/gm;
  let match;
  while ((match = sectionRegex.exec(md)) !== null) {
    sections[match[1]!.trim()] = match[2]!.trim();
  }

  // Общее описание (всё до первого ##)
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
 * Выполняет параллельную генерацию документации для React компонентов
 * Комбинирует AST анализ с LLM для создания подробной документации
 * @param opts - Опции командной строки
 */
export async function generateDocs(opts: CliOptions): Promise<void> {
  try {
    // Применяем кастомную директорию промптов если указана
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

      // В dry-run не удаляем orphaned docs
      return;
    }

    // Удаляем устаревшие файлы документации (для которых нет исходных файлов)
    await cleanupOrphanedDocs(outDir, files, opts.extensions);

    const label = `Docgen (${format})`;

    await processFilesConcurrent(files, async (file, index, total) => {
      // Определяем путь для выходного файла документации
      const ext = format === "json" ? ".json" : ".md";
      const outFile: string = file.replace(/\.(js|jsx|ts|tsx)$/, ext);

      // Читаем исходный код компонента
      const code: string = readFile(file);

      // Извлекаем структурную информацию через AST анализ
      const astInfo = extractComponentInfo(code);

      // Skip файлы без полезного содержимого (barrel files, пустые, re-exports only)
      if (astInfo.fileType === "skip") {
        return { file, success: true, skipped: true, skipReason: "no-content" };
      }

      // Инкрементальность: проверяем хэш исходника
      if (!opts.force && outputFileExists(outDir, outFile)) {
        const existingContent = readOutputFile(outDir, outFile);
        const existingHash = existingContent ? extractDocHash(existingContent) : null;
        const currentHash = hashContent(code);
        if (existingHash === currentHash) {
          return { file, success: true, skipped: true, skipReason: "hash-match" };
        }
        // Хэш изменился — перегенерируем (падаем через к LLM)
      }

      // Формируем специализированный промпт для генерации документации
      const prompt = getDocumentationPrompt(astInfo, code);

      // Запрашиваем у LLM генерацию подробной документации
      let doc: string = await callLlm(opts, prompt);

      // Валидация ответа — проверяем на неправильные ответы
      if (!isValidDocumentation(doc, format)) {
        // Короткая пауза перед retry — возможная причина: нагрузка на LLM
        await new Promise((resolve) => setTimeout(resolve, 500));
        const strictPrompt = makeDocPromptStrict(prompt);
        doc = await callLlm(opts, strictPrompt);
      }

      // Для JSON-формата: конвертируем markdown → JSON
      const outputContent = format === "json"
        ? convertMdToJson(doc, path.basename(file))
        : doc;

      // Добавляем хэш исходника в начало файла для инкрементальности
      const contentWithHash = `<!-- docgen-hash: ${hashContent(code)} -->\n${outputContent}`;

      // Записываем документацию в выходной файл
      const outPath: string = writeOutput(outDir, outFile, contentWithHash);

      return { file, success: true, outputPath: outPath };
    }, opts, label);
  } catch (error) {
    console.error("❌ Ошибка при генерации документации:", error);
    throw error;
  }
}

/**
 * Удаляет файлы документации, для которых нет соответствующих исходных файлов
 */
async function cleanupOrphanedDocs(docsDir: string, sourceFiles: string[], extensions: string): Promise<void> {
  const docFiles = await getDocFiles(docsDir);

  if (docFiles.length === 0) {
    return;
  }

  // Создаем набор ожидаемых md/json файлов на основе исходных файлов
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

  // Удаляем файлы документации, которых нет в ожидаемом наборе
  for (const docFile of docFiles) {
    const normalizedDocFile = path.normalize(docFile);
    if (!expectedDocs.has(normalizedDocFile)) {
      deleteFile(docFile);
      console.log("  🗑️ Deleted orphaned doc:", docFile);
    }
  }
}
