/**
 * @fileoverview Модуль для автоматического добавления комментариев в React код
 * @author AI Docgen
 * @version 1.0.0
 */

import { getFiles, readFile, writeOutput, writeInPlace, hasFileoverview, removeComments, hasCodeChanges } from "./file-utils.js";
import { callLlm } from "./llm.js";
import { extractComponentInfo } from "./ast/ast-extractor.js";
import { getAnnotationPrompt } from "./prompt-loader.js";
import { CliOptions } from "./types.js";

/** Режимы аннотирования */
type AnnotationMode = 'copy' | 'inplace';

/**
 * Создает более строгий промпт для повторных попыток аннотации
 * @param originalPrompt - Оригинальный промпт
 * @param attemptNumber - Номер попытки (начиная с 1)
 * @returns Более строгий промпт
 */
function makePromptMoreStrict(originalPrompt: string, attemptNumber: number): string {
  const warnings = [
    "⚠️ КРИТИЧЕСКИ ВАЖНО: НЕ ИЗМЕНЯЙТЕ исходный код React компонента!",
    "⚠️ КРИТИЧЕСКИ ВАЖНО: НИКОГДА НЕ СОКРАЩАЙ ФАЙЛ ЧЕРЕЗ МНОГОТОЧИЕ (...) ИЛИ ЛЮБЫМ ДРУГИМ СПОСОБОМ!",
    "⚠️ КРИТИЧЕСКИ ВАЖНО: НИКОГДА НЕ УДАЛЯЙ, НЕ ОБРЕЗАЙ И НЕ ЗАМЕНЯЙ ЧАСТИ КОДА НА [...]!",
    "⚠️ КРИТИЧЕСКИ ВАЖНО: ВСЕГДА ВОЗВРАЩАЙ ПОЛНЫЙ ИСХОДНЫЙ КОД С ДОБАВЛЕННЫМИ КОММЕНТАРИЯМИ!",
    "⚠️ Запрещено менять: JSX структуру, пропсы, состояние, методы, импорты, экспорты",
    "⚠️ Запрещено добавлять: eslint-disable и прочие директивы отмены линтинга",
    "⚠️ Разрешено только: добавлять JSDoc комментарии /** */ перед функциями и методами",
    "⚠️ Добавляй JSDoc с тэгом @fileoverview в начале файла с кратким описанием назначения",
    "⚠️ Сохраняйте ВСЮ существующую логику без изменений!"
  ];
  
  const warningText = warnings.join('\n');
  const strictHeader = `\n=== ПОПЫТКА ${attemptNumber} - СТРОГОЕ ПРЕДУПРЕЖДЕНИЕ ===\n${warningText}\n=== КОНЕЦ ПРЕДУПРЕЖДЕНИЯ ===\n\n`;
  
  return strictHeader + originalPrompt + `\n\nПОМНИТЕ: Это попытка ${attemptNumber}. Будьте крайне осторожны с изменениями кода!`;
}

/**
 * Общая логика аннотирования React компонентов
 * @param opts - Опции командной строки
 * @param mode - Режим: 'copy' (в выходную папку) или 'inplace' (прямо в файлы)
 */
async function annotateFiles(opts: CliOptions, mode: AnnotationMode): Promise<void> {
  try {
    // Получаем список файлов для обработки
    const files: string[] = await getFiles(opts.src, opts.extensions);

    // Выводим информацию о количестве файлов
    const modeLabel = mode === 'copy' ? 'Hybrid Annotation' : 'In-Place Annotation';
    console.log(`\n📘 ${modeLabel}: ${files.length} files...\n`);

    let skipped = 0;
    const total = files.length;

    // Обрабатываем каждый файл последовательно
    for (let i = 0; i < total; i++) {
      const file = files[i]!;
      // Читаем содержимое файла
      const code: string = readFile(file);
      
      // Пропускаем файлы с @fileoverview если не указан --force
      if (!opts.force && hasFileoverview(code)) {
        console.log(`⏭️ [${i + 1}/${total}] Skipped (has @fileoverview):`, file);
        skipped++;
        continue;
      }
      
      // Извлекаем структурную информацию через AST
      const astInfo = extractComponentInfo(code);

      // Формируем детальный промпт для LLM
      const prompt = getAnnotationPrompt(astInfo, code);

      // Генерируем код с проверкой изменений (максимум 5 попыток)
      let attempts = 0;
      let annotated: string | null = null;
      let currentPrompt = prompt;
      
      while (attempts < 5) {
        try {
          // Отправляем запрос к LLM и получаем аннотированный код
          const result: string = await callLlm(opts, currentPrompt);
          
          // Проверяем, изменился ли код (игнорируя комментарии)
          if (!hasCodeChanges(code, result)) {
            // Код не изменился, применяем результат
            annotated = result;
            console.log(`✓ [${i + 1}/${total}] Code verification passed:`, file);
            break;
          } else {
            attempts++;
            if (attempts === 5) {
              console.log(`⚠️ [${i + 1}/${total}] Skipped (code changes detected after 5 attempts):`, file);
              console.log("  Original length:", code.length, "Result length:", result.length);
              skipped++;
              annotated = null;
              break;
            }
            console.log(`⚠️ [${i + 1}/${total}] Code changes detected, attempt ${attempts}/5, retrying:`, file);
            console.log("  Original length:", code.length, "Result length:", result.length);
            currentPrompt = makePromptMoreStrict(prompt, attempts);
          }
        } catch (error) {
          attempts++;
          if (attempts === 5) {
            console.log(`❌ [${i + 1}/${total}] Skipped (LLM error after 5 attempts): ${file}`, error);
            annotated = null;
            break;
          }
          console.log(`❌ [${i + 1}/${total}] LLM error on attempt ${attempts}/5, retrying:`, file);
          currentPrompt = makePromptMoreStrict(prompt, attempts);
        }
      }
      
      // Записываем результат только если аннотация успешна
      if (annotated) {
        if (mode === 'copy') {
          const outPath = writeOutput(opts.out + "/annotated", file, annotated);
          console.log(`✓ [${i + 1}/${total}] Annotated:`, outPath);
        } else {
          writeInPlace(file, annotated);
          console.log(`✓ [${i + 1}/${total}] Annotated in-place:`, file);
        }
      }
    }

    // Сообщение о завершении процесса
    console.log(`\n✨ ${modeLabel} completed! (${skipped} files skipped)`);
  } catch (error) {
    console.error("❌ Ошибка при аннотировании:", error);
    throw error;
  }
}

/**
 * Выполняет аннотирование проекта React компонентов в выходную директорию
 * Использует AST анализ для понимания структуры и LLM для генерации комментариев
 * @param opts - Опции командной строки
 */
export async function annotateProject(opts: CliOptions): Promise<void> {
  return annotateFiles(opts, 'copy');
}

/**
 * Выполняет аннотирование файлов непосредственно в исходных файлах (in-place)
 * Использует AST анализ для понимания структуры и LLM для генерации комментариев
 * @param opts - Опции командной строки
 */
export async function annotateInPlace(opts: CliOptions): Promise<void> {
  return annotateFiles(opts, 'inplace');
}
