/**
 * @fileoverview Модуль для загрузки и обработки промптов LLM
 * @author AI Docgen
 * @version 1.0.0
 */

import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

// Получаем директорию текущего модуля
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Загружает промпт из файла и заменяет плейсхолдеры
 * @param promptName - Имя файла промпта (без расширения)
 * @param replacements - Объект с заменами плейсхолдеров
 * @returns Готовый промпт с подставленными значениями
 */
export function loadPrompt(promptName: string, replacements: Record<string, string>): string {
  const promptPath = path.join(__dirname, "prompts", `${promptName}.txt`);
  
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Промпт не найден: ${promptPath}`);
  }
  
  let prompt = fs.readFileSync(promptPath, "utf8");
  
  // Заменяем все плейсхолдеры вида {{KEY}} на значения
  for (const [key, value] of Object.entries(replacements)) {
    prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  
  return prompt;
}

/**
 * Загружает промпт для аннотирования
 * @param astInfo - Информация о компоненте из AST
 * @param code - Исходный код компонента
 * @returns Готовый промпт для аннотирования
 */
export function getAnnotationPrompt(astInfo: any, code: string): string {
  return loadPrompt("annotation", {
    AST_INFO: JSON.stringify(astInfo, null, 2),
    CODE: code
  });
}

/**
 * Загружает промпт для генерации документации
 * @param astInfo - Информация о компоненте из AST
 * @param code - Исходный код компонента
 * @returns Готовый промпт для документации
 */
export function getDocumentationPrompt(astInfo: any, code: string): string {
  return loadPrompt("documentation", {
    AST_INFO: JSON.stringify(astInfo, null, 2),
    CODE: code
  });
}
