/**
 * @fileoverview Модуль для автоматической генерации Markdown документации React компонентов
 * @author AI Docgen
 * @version 1.0.0
 */

import { getFiles, readFile, writeOutput, outputFileExists, getDocFiles, deleteFile } from "./file-utils.js";
import { callLlm } from "./llm.js";
import { extractComponentInfo } from "./ast/ast-extractor.js";
import { getDocumentationPrompt } from "./prompt-loader.js";
import path from "path";
import { CliOptions } from "./types.js";

/**
 * Проверяет, является ли ответ LLM валидной документацией
 * @param response - Ответ от LLM
 * @returns true если ответ является валидной документацией
 */
function isValidDocumentation(response: string): boolean {
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
  
  // Проверяем на наличие паттернов неправильного ответа
  for (const pattern of invalidPatterns) {
    if (responseLower.includes(pattern.toLowerCase())) {
      return false;
    }
  }
  
  // Проверяем, что ответ содержит структуру Markdown
  const hasMarkdownStructure = 
    response.includes('#') || 
    response.includes('##') ||
    response.includes('###') ||
    response.includes('**');
    
  // Проверяем минимальную длину
  const hasMinimumLength = response.trim().length > 50;
  
  return hasMarkdownStructure && hasMinimumLength;
}

/**
 * Выполняет гибридную генерацию документации для React компонентов проекта
 * Комбинирует AST анализ с LLM для создания подробной документации
 * @param opts - Опции командной строки
 */
export async function generateDocs(opts: CliOptions): Promise<void> {
  try {
    // Получаем список файлов компонентов для документирования
    const files: string[] = await getFiles(opts.src, opts.extensions);
    const outDir: string = opts.out + "/docs";

    // Информируем о начале процесса
    console.log(`\n📚 Hybrid Docgen: ${files.length} files...\n`);

    // Удаляем устаревшие файлы документации (для которых нет исходных файлов)
    await cleanupOrphanedDocs(outDir, files, opts.extensions);

    // Обрабатываем каждый файл последовательно
    for (const file of files) {
      // Определяем путь для выходного файла документации
      const outFile: string = file.replace(/\.(js|jsx|ts|tsx)$/, ".md");
      
      // Проверяем, существует ли уже файл документации
      if (!opts.force && outputFileExists(outDir, outFile)) {
        console.log("⏭️ Skip (exists):", outFile);
        continue;
      }
      
      // Читаем исходный код компонента
      const code: string = readFile(file);
      
      // Извлекаем структурную информацию через AST анализ
      const astInfo = extractComponentInfo(code);

      // Формируем специализированный промпт для генерации документации
      const prompt = getDocumentationPrompt(astInfo, code);

      // Запрашиваем у LLM генерацию подробной документации
      let doc: string = await callLlm(opts, prompt);
      
      // Валидация ответа - проверяем на неправильные ответы
      const isValidDoc = isValidDocumentation(doc);
      if (!isValidDoc) {
        console.log("⚠️ Получен неправильный ответ от LLM, повторная попытка с более строгим промптом...");
        
        // Создаем более строгий промпт
        const strictPrompt = prompt + "\n\nКРИТИЧЕСКИ ВАЖНО: Создай полную Markdown документацию. НЕ пиши сообщения об ошибках. НЕ проси дополнительную информацию. ИСПОЛЬЗУЙ данные из AST!";
        
        doc = await callLlm(opts, strictPrompt);
      }

      // Записываем документацию в выходной файл
      const outPath: string = writeOutput(outDir, outFile, doc);

      // Сообщаем о завершении обработки файла
      console.log("✓ Doc:", outPath);
    }

    // Сообщение об успешном завершении процесса
    console.log("\n✨ Hybrid documentation completed!");
  } catch (error) {
    // Обработка ошибок с подробным логированием
    console.error("❌ Ошибка при генерации документации:", error);
    throw error;
  }
}

/**
 * Удаляет файлы документации, для которых нет соответствующих исходных файлов
 * @param docsDir - Директория с документацией
 * @param sourceFiles - Список исходных файлов
 * @param extensions - Расширения исходных файлов
 */
async function cleanupOrphanedDocs(docsDir: string, sourceFiles: string[], extensions: string): Promise<void> {
  const docFiles = await getDocFiles(docsDir);
  
  if (docFiles.length === 0) {
    return;
  }

  // Создаем набор ожидаемых md файлов на основе исходных файлов
  const expectedDocs = new Set<string>();
  for (const srcFile of sourceFiles) {
    const mdFile = srcFile.replace(/\.(js|jsx|ts|tsx)$/, ".md");
    const rel = path.relative(process.cwd(), mdFile);
    const expectedPath = path.join(docsDir, rel);
    expectedDocs.add(path.normalize(expectedPath));
  }

  // Удаляем файлы документации, которых нет в ожидаемом наборе
  for (const docFile of docFiles) {
    const normalizedDocFile = path.normalize(docFile);
    if (!expectedDocs.has(normalizedDocFile)) {
      deleteFile(docFile);
      console.log("🗑️ Deleted orphaned doc:", docFile);
    }
  }
}
