/**
 * @fileoverview Командная строка для react-docgen-ai
 * @author AI Docgen
 * @version 1.0.0
 */

import { Command } from "commander";
import { annotateProject, annotateInPlace } from "./annotator.js";
import { generateDocs } from "./docgen.js";
import { generateGraph } from "./generate-graph.js";
import { generateWiki } from "./wiki-generator.js";
import { CliOptions } from "./types.js";
import { readEnv, readEnvInt, readEnvFloat } from "./env.js";

// ── Env-умолчания ──────────────────────────────────────────────────────────
const DEFAULT_API       = readEnv("LLM_API_URL", "http://localhost:8000/completions");
const DEFAULT_MAX_TOKENS = String(readEnvInt("LLM_MAX_TOKENS", 4096));
const DEFAULT_TEMP       = String(readEnvFloat("LLM_TEMPERATURE", 0.1));
const DEFAULT_OUT        = readEnv("DOCGEN_OUT", "./ai-output");
const DEFAULT_EXTENSIONS = readEnv("DOCGEN_EXTENSIONS", "js,jsx,ts,tsx");
const DEFAULT_PARALLEL   = String(readEnvInt("DOCGEN_PARALLEL", 4));
const DEFAULT_WIKI       = readEnv("DOCGEN_WIKI", "");

/**
 * Определяет путь wiki из CLI-аргумента.
 * - `--wiki ./path` → ./path
 * - `--wiki` (без значения) → ./wiki
 * - ничего → undefined (отключено) или env-значение
 */
function resolveWiki(wikiOpt: string | boolean | undefined): string | undefined {
  if (wikiOpt === true) {
    // --wiki без значения → дефолтный путь
    return "./wiki";
  }
  if (typeof wikiOpt === "string" && wikiOpt.trim()) {
    return wikiOpt.trim();
  }
  // undefined или пустая строка → отключено
  return undefined;
}

// Инициализируем новый экземпляр командной строки
const program = new Command();

program
  .name("react-docgen-ai")
  .description("Автоматическое документирование и аннотирование React кода с использованием LLM")
  .version("1.0.0");

program
  .requiredOption("-s, --src <path>", "Путь к исходной директории или отдельному файлу с React компонентами")
  .option("-o, --out <path>", "Выходная директория для результатов", DEFAULT_OUT)
  .option("--annotate", "Аннотировать код путем добавления подробных комментариев")
  .option("--annotate-inplace", "Аннотировать код непосредственно в исходных файлах")
  .option("--docs", "Генерировать подробную Markdown документацию для компонентов")
  .option("--graph", "Генерировать граф зависимостей компонентов (DOT и Markdown форматы)")
  .option("-e, --extensions <exts>", "Расширения файлов для обработки", DEFAULT_EXTENSIONS)
  .option("--api <url>", "URL API для локального LLM сервера", DEFAULT_API)
  .option("--opencode", "Использовать OpenCode SDK вместо HTTP запросов к LLM", false)
  .option("--opencode-model <model>", "Модель для OpenCode (формат: provider/model, например openrouter/anthropic/claude-sonnet-4)", readEnv("OPENCODE_DEFAULT_MODEL", ""))
  .option("--max-tokens <number>", "Максимальное количество токенов для LLM запросов", DEFAULT_MAX_TOKENS)
  .option("--temperature <number>", "Температура генерации LLM (0.0 - 1.0)", DEFAULT_TEMP)
  .option("--force", "Принудительно обрабатывать файлы с @fileoverview", false)
  // Новые опции
  .option("--parallel <number>", "Количество параллельных запросов к LLM", DEFAULT_PARALLEL)
  .option("--prompt-dir <path>", "Директория с кастомными файлами промптов")
  .option("--dry-run", "Режим сухого прогона (без вызова LLM и записи)", false)
  .option("--format <format>", "Формат вывода документации (markdown|json)", "markdown")
  .option("--stream", "Использовать streaming для HTTP провайдера", false)
  .option("--wiki [path]", "Генерировать LLM Wiki (Obsidian-совместимая документация) в указанную директорию", DEFAULT_WIKI || undefined);

program.action(async (opts: Record<string, any>) => {
  try {
    // Проверяем, что выбрана хотя бы одна операция
    if (!opts.annotate && !opts.annotateInplace && !opts.docs && !opts.graph && !opts.wiki) {
      console.log("❌ Ошибка: Выберите хотя бы одну опцию: --annotate, --annotate-inplace, --docs, --graph или --wiki");
      console.log("\n📖 Использование:");
      console.log("  react-docgen-ai --src ./src --annotate");
      console.log("  react-docgen-ai --src ./src --annotate-inplace");
      console.log("  react-docgen-ai --src ./src --docs");
      console.log("  react-docgen-ai --src ./src --graph");
      console.log("  react-docgen-ai --src ./src --wiki");
      console.log("  react-docgen-ai --src ./src --annotate --docs --graph");
      process.exit(1);
    }

    // Нормализуем типы (Commander возвращает строки)
    const resolvedWiki = resolveWiki(opts.wiki);
    const normalized: CliOptions = {
      src: opts.src,
      out: opts.out,
      annotate: opts.annotate ?? false,
      annotateInplace: opts.annotateInplace ?? false,
      docs: opts.docs ?? false,
      graph: opts.graph ?? false,
      extensions: opts.extensions,
      api: opts.api,
      force: opts.force ?? false,
      opencode: opts.opencode ?? false,
      opencodeModel: opts.opencodeModel ?? "",
      parallel: parseInt(opts.parallel, 10) || 4,
      promptDir: opts.promptDir || undefined,
      dryRun: opts.dryRun ?? false,
      format: opts.format === "json" ? "json" : "markdown",
      stream: opts.stream ?? false,
      ...(resolvedWiki ? { wiki: resolvedWiki } : {}),
    };

    if (opts.dryRun) {
      console.log("\n🧪 ===== DRY RUN MODE =====");
      console.log("  Files will be scanned but no LLM calls or writes will be made.\n");
    }

    // Выполняем аннотирование кода если опция указана
    if (opts.annotate) {
      await annotateProject(normalized);
    }

    if (opts.annotateInplace) {
      await annotateInPlace(normalized);
    }

    if (opts.docs) {
      await generateDocs(normalized);
    }

    if (opts.graph) {
      await generateGraph(normalized);
    }

    if (opts.wiki) {
      await generateWiki(normalized, opts.wiki);
    }

    if (!opts.dryRun) {
      console.log("\n🎉 Все операции успешно завершены!");
    }
  } catch (error) {
    console.error("❌ Критическая ошибка:", error);

    if (error instanceof Error) {
      if (error.message.includes("EACCES")) {
        console.log("\n💡 Возможно, недостаточно прав доступа.");
      } else if (error.message.includes("ENOENT")) {
        console.log("\n💡 Возможно, указан несуществующий путь.");
      }
    }

    process.exit(1);
  }
});

program.on("command:*", () => {
  console.error("❌ Неизвестная команда. Используйте --help для получения справки.");
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n\n⏹️ Получен сигнал прерывания. Завершение работы...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n\n⏹️ Получен сигнал завершения. Завершение работы...");
  process.exit(0);
});

program.parse(process.argv);
