#!/usr/bin/env node
/**
 * @fileoverview Entry point для react-docgen-ai CLI
 * Поддерживает Node.js (dist/) и Bun (src/ напрямую)
 */

async function main() {
  try {
    // Сначала пробуем скомпилированную версию (Node.js)
    await import("../dist/cli.js");
  } catch {
    // Если нет dist — запускаем напрямую из src (Bun)
    await import("../src/cli.ts");
  }
}

main();
