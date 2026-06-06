/**
 * @fileoverview Модуль для генерации графа зависимостей React компонентов
 * @author AI Docgen
 * @version 1.0.0
 */

import { getFiles, readFile } from "./file-utils.js";
import { buildComponentGraph, graphToDot, graphToMarkdown } from "./ast/component-graph.js";
import fs from "fs-extra";
import { CliOptions } from "./types.js";

/**
 * Генерирует визуальные представления графа компонентов проекта
 * Создает DOT файл для Graphviz и Markdown представление
 * @param opts - Опции командной строки
 */
export async function generateGraph(opts: CliOptions): Promise<void> {
  try {
    // Получаем список всех файлов компонентов в проекте
    const filePaths: string[] = await getFiles(opts.src, opts.extensions);

    // Преобразуем пути к файлам в структурированный формат
    const files = filePaths.map((p: string) => ({
      path: p,
      content: readFile(p)
    }));

    // Строим граф зависимостей компонентов
    const graph = buildComponentGraph(files);

    // Преобразуем граф в различные форматы для визуализации
    const dot: string = graphToDot(graph);
    const md: string = graphToMarkdown(graph);

    // Создаем директорию для выходных файлов
    const outDir: string = opts.out + "/graph";
    fs.ensureDirSync(outDir);

    // Записываем DOT файл для Graphviz
    fs.writeFileSync(outDir + "/components.dot", dot);
    
    // Записываем Markdown файл с описанием иерархии
    fs.writeFileSync(outDir + "/components.md", md);

    // Выводим инструкции по использованию
    console.log("✓ Graph DOT file saved to:", outDir + "/components.dot");
    console.log("✓ Markdown tree saved to:", outDir + "/components.md");

    // Предоставляем команду для генерации PNG изображения
    console.log("\n📊 Для визуализации графа выполните:");
    console.log(`dot -Tpng ${outDir}/components.dot -o ${outDir}/components.png`);
    
    // Дополнительные возможности визуализации
    console.log("\n🔧 Дополнительные форматы:");
    console.log(`dot -Tsvg ${outDir}/components.dot -o ${outDir}/components.svg`);
    console.log(`dot -Tpdf ${outDir}/components.dot -o ${outDir}/components.pdf`);

  } catch (error) {
    // Обработка ошибок с подробным логированием
    console.error("❌ Ошибка при генерации графа компонентов:", error);
    throw error;
  }
}