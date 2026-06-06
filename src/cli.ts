/**
 * @fileoverview Командная строка для react-docgen-ai
 * @author AI Docgen
 * @version 1.0.0
 */

import { Command } from "commander";
import { annotateProject, annotateInPlace } from "./annotator.js";
import { generateDocs } from "./docgen.js";
import { generateGraph } from "./generate-graph.js";
import { CliOptions } from "./types.js";

// Инициализируем новый экземпляр командной строки
const program = new Command();

/**
 * Настраиваем базовую информацию о приложении
 */
program
  .name("react-docgen-ai")
  .description("Автоматическое документирование и аннотирование React кода с использованием локального LLM")
  .version("1.0.0");

/**
 * Определяем доступные опции командной строки
 */
program
  .requiredOption("-s, --src <path>", "Путь к исходной директории или отдельному файлу с React компонентами")
  .option("-o, --out <path>", "Выходная директория для результатов", "./ai-output")
  .option("--annotate", "Аннотировать код путем добавления подробных комментариев")
  .option("--annotate-inplace", "Аннотировать код непосредственно в исходных файлах")
  .option("--docs", "Генерировать подробную Markdown документацию для компонентов")
  .option("--graph", "Генерировать граф зависимостей компонентов (DOT и Markdown форматы)")
  .option("-e, --extensions <exts>", "Расширения файлов для обработки", "js,jsx,ts,tsx")
  .option("--api <url>", "URL API для локального LLM сервера", "http://localhost:8000/completions")
  .option("--max-tokens <number>", "Максимальное количество токенов для LLM запросов", "4096")
  .option("--temperature <number>", "Температура генерации LLM (0.0 - 1.0)", "0.1")
  .option("--force", "Принудительно обрабатывать файлы с @fileoverview", false);

/**
 * Главный обработчик команд
 * Определяет какие операции выполнить на основе переданных опций
 * @param opts - Парсированные опции командной строки
 */
program.action(async (opts: CliOptions & { maxTokens?: string; temperature?: string; annotateInplace?: boolean }) => {
  try {
    // Проверяем, что выбрана хотя бы одна операция
    if (!opts.annotate && !opts.annotateInplace && !opts.docs && !opts.graph) {
      console.log("❌ Ошибка: Выберите хотя бы одну опцию: --annotate, --annotate-inplace, --docs или --graph");
      console.log("\n📖 Использование:");
      console.log("  react-docgen-ai --src ./src --annotate");
      console.log("  react-docgen-ai --src ./src --annotate-inplace");
      console.log("  react-docgen-ai --src ./src --docs");
      console.log("  react-docgen-ai --src ./src --graph");
      console.log("  react-docgen-ai --src ./src --annotate --docs --graph");
      process.exit(1);
    }

    // Выполняем аннотирование кода если опция указана
    if (opts.annotate) {
      console.log("🚀 Запуск аннотирования кода...");
      await annotateProject(opts);
    }

    // Выполняем аннотирование in-place если опция указана
    if (opts.annotateInplace) {
      console.log("🚀 Запуск аннотирования кода in-place...");
      await annotateInPlace(opts);
    }

    // Генерируем документацию если опция указана
    if (opts.docs) {
      console.log("📚 Запуск генерации документации...");
      await generateDocs(opts);
    }

    // Генерируем граф компонентов если опция указана
    if (opts.graph) {
      console.log("🕸️ Запуск генерации графа компонентов...");
      await generateGraph(opts);
    }

    // Сообщение об успешном завершении всех операций
    console.log("\n🎉 Все операции успешно завершены!");
    if (opts.annotate) {
      console.log(`📁 Результаты сохранены в: ${opts.out}`);
    }

  } catch (error) {
    // Обработка критических ошибок
    console.error("❌ Критическая ошибка:", error);
    
    // Предоставляем подсказки по устранению проблем
    if (error instanceof Error) {
      if (error.message.includes("EACCES")) {
        console.log("\n💡 Возможно, недостаточно прав доступа. Попробуйте:");
        console.log("  - Проверить права доступа к директориям");
        console.log("  - Запустить с правами администратора");
      } else if (error.message.includes("ENOENT")) {
        console.log("\n💡 Возможно, указан несуществующий путь. Проверьте:");
        console.log("  - Существование исходной директории или файла");
        console.log("  - Корректность пути к LLM API");
      }
    }
    
    process.exit(1);
  }
});

/**
 * Обработка неизвестных команд или неправильного использования
 */
program.on("command:*", () => {
  console.error("❌ Неизвестная команда. Используйте --help для получения справки.");
  process.exit(1);
});

/**
 * Обработка сигналов завершения для корректного закрытия
 */
process.on("SIGINT", () => {
  console.log("\n\n⏹️ Получен сигнал прерывания. Завершение работы...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n\n⏹️ Получен сигнал завершения. Завершение работы...");
  process.exit(0);
});

// Парсим аргументы командной строки и запускаем программу
program.parse(process.argv);