/**
 * @fileoverview Загрузка .env и типизированные хелперы чтения переменных окружения
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";

/** Загружает .env из корня проекта (рядом с package.json) */
function loadEnv(): void {
  // Ищем .env в директории проекта (поднимаемся от dist/ если запущено после сборки)
  const searchPaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "..", ".env"),
    path.resolve(__dirname, ".env"),
  ];

  for (const envPath of searchPaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return;
    }
  }
}

// Single execution — load .env on first import
let loaded = false;

/**
 * Читает строковое значение из process.env.
 * Возвращает fallback, если переменная не задана или пуста.
 */
export function readEnv(key: string, fallback: string): string {
  if (!loaded) {
    loadEnv();
    loaded = true;
  }
  const val = process.env[key];
  return val && val.trim() !== "" ? val.trim() : fallback;
}

/**
 * Читает целочисленное значение из process.env.
 * Возвращает fallback, если переменная не задана или не является числом.
 */
export function readEnvInt(key: string, fallback: number): number {
  const val = readEnv(key, String(fallback));
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Читает число с плавающей точкой из process.env.
 * Возвращает fallback, если переменная не задана или не является числом.
 */
export function readEnvFloat(key: string, fallback: number): number {
  const val = readEnv(key, String(fallback));
  const parsed = parseFloat(val);
  return Number.isNaN(parsed) ? fallback : parsed;
}
