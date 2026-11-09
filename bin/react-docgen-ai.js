#!/usr/bin/env node
/**
 * @fileoverview Entry point для react-docgen-ai CLI
 * Запускает собранную версию из dist/ под Node; исходники на TypeScript — только когда
 * dist/ отсутствует (запуск из чекаута через Bun).
 *
 * Ошибки не глотаются: раньше dist-импорт был обёрнут в пустой try/catch, поэтому любое
 * падение внутри CLI (например, краш на __dirname в ESM) выглядело как невнятное
 * "Cannot find module ../src/cli.ts".
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const compiled = join(moduleDir, "..", "dist", "cli.js");

if (existsSync(compiled)) {
  await import(compiled);
} else {
  await import(join(moduleDir, "..", "src", "cli.ts"));
}
