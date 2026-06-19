/**
 * @fileoverview Модуль для загрузки и обработки промптов LLM
 * @author AI Docgen
 * @version 1.0.0
 */

import fs from "fs";
import path from "path";
import { FileType } from "./types.js";
import { buildPromptPayload } from "./ast/compact-format.js";

let _promptDirOverride: string | null = null;

/**
 * Устанавливает кастомную директорию промптов (из --prompt-dir).
 */
export function setPromptDirectory(dir: string): void {
  _promptDirOverride = dir;
}

/**
 * Сбрасывает кастомную директорию промптов.
 */
export function resetPromptDirectory(): void {
  _promptDirOverride = null;
}

// Получаем базовую директорию для промптов
const getPromptsDirectory = (): string => {
  // 1. Если задана кастомная директория через --prompt-dir
  if (_promptDirOverride && fs.existsSync(_promptDirOverride)) {
    return _promptDirOverride;
  }

  // Проверяем несколько возможных путей в порядке приоритета
  const possiblePaths = [
    // 2. Относительно исходного кода (для разработки и тестов)
    path.join(process.cwd(), 'src', 'prompts'),
    // 3. Относительно скомпилированного кода (для production)
    path.join(process.cwd(), 'dist', 'prompts')
  ];

  // Дополнительно проверяем пути относительно текущего модуля (если доступно)
  try {
    const currentDir = __dirname;
    const moduleBasedPaths = [
      path.join(currentDir, 'prompts'),
      path.join(currentDir, '..', 'prompts'),
      path.join(currentDir, '..', '..', 'src', 'prompts'),
      path.join(currentDir, '..', '..', 'dist', 'prompts')
    ];
    
    possiblePaths.push(...moduleBasedPaths);
  } catch (error) {
    // Игнорируем ошибки с __dirname
  }
  
  // Находим первый существующий путь
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      return testPath;
    }
  }
  
  // Если ничего не найдено, возвращаем стандартный путь
  return path.join(process.cwd(), 'src', 'prompts');
};

/**
 * Загружает промпт из файла и заменяет плейсхолдеры
 * @param promptName - Имя файла промпта (без расширения)
 * @param replacements - Объект с заменами плейсхолдеров
 * @returns Готовый промпт с подставленными значениями
 */
export function loadPrompt(promptName: string, replacements: Record<string, string>): string {
  const promptPath = path.join(getPromptsDirectory(), `${promptName}.txt`);
  
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Промпт не найден: ${promptPath}`);
  }
  
  let prompt = fs.readFileSync(promptPath, "utf8");
  
  // Заменяем все плейсхолдеры вида {{KEY}} на значения
  for (const [key, value] of Object.entries(replacements)) {
    // Заменяем простой строкой для избежания проблем с регулярными выражениями
    const placeholder = `{{${key}}}`;
    prompt = prompt.split(placeholder).join(value);
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
 * Маппинг FileType → имя файла промпта.
 * Если тип неизвестен — fallback на component.
 */
const PROMPT_BY_TYPE: Record<FileType, string> = {
  component: "component",
  hook: "hook",
  context: "context",
  store: "store",
  util: "util",
  types: "types",
  skip: "component", // не используется (skip-файлы отфильтрованы ранее)
};

/**
 * Загружает тип-специфичный промпт для генерации документации.
 * Выбирает файл промпта на основе astInfo.fileType.
 * Использует компактный AST-формат вместо JSON + авто-режим для кода.
 * @param astInfo - Информация о компоненте из AST (с полем fileType)
 * @param code - Исходный код компонента
 * @returns Готовый промпт с подставленными значениями
 */
export function getDocumentationPrompt(astInfo: any, code: string): string {
  const fileType: FileType = astInfo.fileType ?? "component";
  const promptName = PROMPT_BY_TYPE[fileType] ?? "component";
  const payload = buildPromptPayload(astInfo, code);

  return loadPrompt(promptName, {
    AST_INFO: payload.AST_INFO,
    CODE: payload.CODE,
  });
}
