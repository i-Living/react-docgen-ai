/**
 * @fileoverview Утилиты для работы с файловой системой
 * @author AI Docgen
 * @version 1.0.0
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Рекурсивно находит файлы с указанными расширениями в директории
 */
function findFilesRecursive(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFilesRecursive(fullPath, extensions));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).substring(1).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Получает список файлов для обработки
 * Поддерживает как директории, так и отдельные файлы
 * @param src - Путь к исходной директории или файлу
 * @param extensions - Список расширений файлов через запятую
 * @returns Promise с массивом путей к файлам
 */
export async function getFiles(src: string, extensions: string): Promise<string[]> {
  // Проверяем, существует ли путь и является ли он файлом
  const pathExists = fs.existsSync(src);
  if (!pathExists) {
    throw new Error(`Путь не найден: ${src}`);
  }

  const stats = fs.statSync(src);
  
  // Если это файл, проверяем его расширение и возвращаем сразу
  if (stats.isFile()) {
    return validateAndReturnSingleFile(src, extensions);
  }
  
  // Если это директория, используем рекурсивный поиск файлов
  return getFilesFromDirectory(src, extensions);
}

/**
 * Проверяет и возвращает одиночный файл
 * @param filePath - Путь к файлу
 * @param extensions - Список допустимых расширений
 * @returns Массив с одним файлом если он подходит
 */
function validateAndReturnSingleFile(filePath: string, extensions: string): string[] {
  // Разбиваем строку расширений на массив, убирая лишние пробелы
  const exts: string[] = extensions.split(",").map((e: string) => e.trim());
  
  // Получаем расширение файла
  const fileExt = path.extname(filePath).substring(1).toLowerCase();
  
  // Проверяем, входит ли расширение файла в список допустимых
  if (!exts.includes(fileExt)) {
    throw new Error(`File extension '.${fileExt}' is not in allowed list: ${extensions}`);
  }
  
  return [filePath];
}

/**
 * Получает список файлов из директории по расширениям
 * @param src - Путь к исходной директории
 * @param extensions - Список расширений файлов через запятую
 * @returns Promise с массивом путей к файлам
 */
async function getFilesFromDirectory(src: string, extensions: string): Promise<string[]> {
  const exts: string[] = extensions.split(",").map((e: string) => e.trim());
  return findFilesRecursive(src, exts);
}

/**
 * Читает содержимое файла
 * @param filePath - Путь к файлу
 * @returns Содержимое файла в виде строки
 */
export function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Записывает обработанный контент в выходную директорию
 * Сохраняет структуру директорий относительно исходной
 * @param baseOut - Базовая выходная директория
 * @param srcFile - Путь к исходному файлу
 * @param content - Контент для записи
 * @returns Путь к созданному файлу
 */
export function writeOutput(baseOut: string, srcFile: string, content: string): string {
  // Получаем относительный путь от текущей рабочей директории
  const rel: string = path.relative(process.cwd(), srcFile);
  
  // Формируем полный путь для выходного файла
  const outPath: string = path.join(baseOut, rel);
  
  // Создаем директории если они не существуют
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  
  // Записываем контент в файл
  fs.writeFileSync(outPath, content);
  
  return outPath;
}

/**
 * Записывает контент непосредственно в исходный файл (in-place)
 * @param filePath - Путь к файлу для перезаписи
 * @param content - Новый контент для записи
 */
export function writeInPlace(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, "utf8");
}

/**
 * Проверяет, содержит ли файл тег @fileoverview в начале
 * @param content - Содержимое файла
 * @returns true если файл содержит @fileoverview
 */
export function hasFileoverview(content: string): boolean {
  // Проверяем первые 500 символов на наличие @fileoverview
  const header = content.slice(0, 500);
  return /@fileoverview/.test(header);
}

/**
 * Удаляет все комментарии из кода JavaScript/TypeScript
 * @param code - Исходный код
 * @returns Код без комментариев
 */
export function removeComments(code: string): string {
  // Создаем массив для защищенных строк
  const strings: string[] = [];
  let stringIndex = 0;
  
  let result = code;
  
  // Защищаем строки в одинарных кавычках
  result = result.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, (match) => {
    strings[stringIndex] = match;
    return `__STRING_${stringIndex++}__`;
  });
  
  // Защищаем строки в двойных кавычках
  result = result.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, (match) => {
    strings[stringIndex] = match;
    return `__STRING_${stringIndex++}__`;
  });
  
  // Защищаем строки в обратных кавычках (template literals)
  result = result.replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, (match) => {
    strings[stringIndex] = match;
    return `__STRING_${stringIndex++}__`;
  });
  
  // Защищаем регулярные выражения (RegExp literals) от ложного удаления
  // Не захватываем // как начало regexp, т.к. нужен хотя бы 1 символ между //
  result = result.replace(/\/(?!\*)(?:\[[^\]]*\]|[^\/\\\n]|\\.)+\/[gimsuy]*/g, (match) => {
    strings[stringIndex] = match;
    return `__REGEXP_${stringIndex++}__`;
  });

  // Удаляем многострочные комментарии (/* comment */ и /** JSDoc */)
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');

  // Удаляем однострочные комментарии (// comment) 
  // Не удаляем часть после // если это часть URL или протокола
  result = result.replace(/(?:^|[ \t])\/\/.*$/gm, '');
  
  // Восстанавливаем все защищенные строки и регулярные выражения
  result = result.replace(/__(STRING|REGEXP)_(\d+)__/g, (match, type, index) => {
    return strings[parseInt(index)] || match;
  });
  
  // Убираем лишние переносы строк в начале файла
  result = result.replace(/^\s*\n/, '');
  
  // Удаляем множественные переносы строк (более 1 подряд)
  result = result.replace(/\n\s*\n\s*\n+/g, '\n\n');
  // Удаляем лишние пробелы в конце строк
  result = result.replace(/\s+$/gm, '');
  // Убираем множественные пробелы в строке (оставляем только 1)
  result = result.replace(/[ \t]+/g, ' ');
  // Нормализуем переносы строк (убираем лишние пробелы вокруг них)
  result = result.replace(/\n\s+/g, '\n');
  // Удаляем пустые строки в начале и конце
  result = result.trim();
  
  return result;
}

/**
 * Проверяет, изменился ли код по сравнению с оригиналом
 * @param original - Оригинальный код
 * @param modified - Модифицированный код
 * @returns true если код изменился (игнорируя комментарии)
 */
export function hasCodeChanges(original: string, modified: string): boolean {
  const originalClean = removeComments(original);
  const modifiedClean = removeComments(modified);
  
  return originalClean !== modifiedClean;
}

/**
 * Проверяет, существует ли выходной файл
 * @param baseOut - Базовая выходная директория
 * @param srcFile - Путь к исходному файлу
 * @returns true если выходной файл уже существует
 */
export function outputFileExists(baseOut: string, srcFile: string): boolean {
  const rel: string = path.relative(process.cwd(), srcFile);
  const outPath: string = path.join(baseOut, rel);
  try {
    return fs.statSync(outPath).isFile();
  } catch {
    return false;
  }
}

/**
 * Получает список всех md файлов в директории документации
 * @param docsDir - Директория с документацией
 * @returns Promise с массивом путей к md файлам
 */
export async function getDocFiles(docsDir: string): Promise<string[]> {
  if (!fs.existsSync(docsDir)) {
    return [];
  }
  return findFilesRecursive(docsDir, ['md']);
}

/**
 * Удаляет файл
 * @param filePath - Путь к файлу для удаления
 */
export function deleteFile(filePath: string): void {
  fs.rmSync(filePath, { recursive: true, force: true });
}

// ── Hash-based incrementality ───────────────────────────────────────────────

/**
 * Вычисляет SHA-256 хэш содержимого (первые 16 hex-символов).
 * Используется для инкрементальности — если хэш исходника не изменился,
 * LLM-вызов пропускается.
 */
export function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").substring(0, 16);
}

/**
 * Читает существующий выходной файл документации.
 * @param baseOut - Базовая выходная директория
 * @param srcFile - Путь к исходному файлу
 * @returns Содержимое файла или null, если файл не существует
 */
export function readOutputFile(baseOut: string, srcFile: string): string | null {
  const rel: string = path.relative(process.cwd(), srcFile);
  const outPath: string = path.join(baseOut, rel);
  try {
    return fs.readFileSync(outPath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Извлекает хэш из файла документации (HTML-комментарий в начале).
 * Формат: `<!-- docgen-hash: abc123 -->`
 * @returns Хэш или null, если комментарий не найден
 */
export function extractDocHash(content: string): string | null {
  const match = content.match(/<!-- docgen-hash: ([a-f0-9]+) -->/);
  return match?.[1] ?? null;
}

/**
 * Извлекает хэш из YAML frontmatter wiki-страницы.
 * Формат: `hash: abc123`
 * @returns Хэш или null, если поле не найдено
 */
export function extractWikiHash(content: string): string | null {
  const match = content.match(/^hash:\s*([a-f0-9]+)/m);
  return match?.[1] ?? null;
}
