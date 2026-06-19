/**
 * @fileoverview .env loading and typed helpers for reading environment variables
 */

import dotenv from "dotenv";
import path from "path";
import fs from "fs";

/** Loads .env from project root (next to package.json) */
function loadEnv(): void {
  // Look for .env in project directory (climb from dist/ if running after build)
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
 * Reads a string value from process.env.
 * Returns fallback if variable is not set or empty.
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
 * Reads an integer value from process.env.
 * Returns fallback if variable is not set or is not a number.
 */
export function readEnvInt(key: string, fallback: number): number {
  const val = readEnv(key, String(fallback));
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Reads a float value from process.env.
 * Returns fallback if variable is not set or is not a number.
 */
export function readEnvFloat(key: string, fallback: number): number {
  const val = readEnv(key, String(fallback));
  const parsed = parseFloat(val);
  return Number.isNaN(parsed) ? fallback : parsed;
}
