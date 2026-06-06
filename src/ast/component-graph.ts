/**
 * @fileoverview Построитель графа зависимостей React компонентов
 * @author AI Docgen
 * @version 1.0.0
 */

import path from "path";
import { extractComponentInfo } from "./ast-extractor.js";
import { FileInfo, ComponentGraph } from "../types.js";

/**
 * Строит граф компонентов из массива файлов
 * @param files - Массив файлов с их путями и содержимым
 * @returns Граф компонентов в виде объекта
 */
export function buildComponentGraph(files: FileInfo[]): ComponentGraph {
  // Инициализируем пустой граф
  const graph: ComponentGraph = {};

  // Обрабатываем каждый файл
  for (const file of files) {
    // Извлекаем информацию о компоненте из AST
    const info = extractComponentInfo(file.content);
    
    // Пропускаем файлы, которые не экспортируют компоненты
    if (!info.exportsComponent) continue;

    // Определяем имя компонента (используем имя из AST или имя файла)
    const componentName = info.name || path.basename(file.path, path.extname(file.path));
    
    // Фильтруем дочерние компоненты (только те, что начинаются с заглавной буквы)
    const childComponents = info.jsxTree.filter((component: string) => /^[A-Z]/.test(component));

    // Добавляем узел в граф
    graph[componentName] = {
      file: file.path,
      children: childComponents
    };
  }

  return graph;
}

/**
 * Преобразует граф компонентов в формат DOT для Graphviz
 * @param graph - Граф компонентов
 * @returns DOT представление графа
 */
export function graphToDot(graph: ComponentGraph): string {
  // Начинаем формировать DOT код
  let dot: string = "digraph Components {\n";
  dot += "  // Настройки отображения графа\n";
  dot += "  node [shape=box, style=filled, fillcolor=lightblue];\n";
  dot += "  edge [color=gray];\n\n";

  // Добавляем узлы и связи
  for (const [name, data] of Object.entries(graph)) {
    // Добавляем описание узла с информацией о файле
    dot += `  "${name}" [label="${name}\\n(${path.basename(data.file)})"];\n`;
    
    // Добавляем связи к дочерним компонентам
    for (const child of data.children) {
      dot += `  "${name}" -> "${child}";\n`;
    }
  }

  dot += "}\n";
  return dot;
}

/**
 * Преобразует граф компонентов в Markdown формат
 * @param graph - Граф компонентов  
 * @returns Markdown представление графа
 */
export function graphToMarkdown(graph: ComponentGraph): string {
  let md: string = "# Component Tree\n\n";
  md += "Иерархия React компонентов проекта.\n\n";

  // Обрабатываем каждый узел графа
  for (const [name, data] of Object.entries(graph)) {
    // Заголовок компонента
    md += `## ${name}\n\n`;
    
    // Информация о файле
    md += `**Файл:** \`${data.file}\`\n\n`;

    // Дочерние компоненты
    if (data.children.length === 0) {
      md += "**Дочерние компоненты:** ➡️ Нет\n\n";
    } else {
      md += "**Дочерние компоненты:**\n";
      for (const child of data.children) {
        md += `- ${child}\n`;
      }
      md += "\n";
    }

    // Добавляем разделитель между компонентами
    md += "---\n\n";
  }

  return md;
}