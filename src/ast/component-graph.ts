/**
 * @fileoverview React component dependency graph builder
 * @author AI Docgen
 * @version 1.0.0
 */

import path from "path";
import { extractComponentInfo } from "./ast-extractor.js";
import { FileInfo, ComponentGraph } from "../types.js";

/**
 * Builds a component graph from an array of files
 * @param files - Array of files with paths and content
 * @returns Component graph as object
 */
export function buildComponentGraph(files: FileInfo[]): ComponentGraph {
  // Initialize empty graph
  const graph: ComponentGraph = {};

  // Process each file
  for (const file of files) {
    // Extract component info from AST
    const info = extractComponentInfo(file.content);
    
    // Skip files that don't export components
    if (!info.exportsComponent) continue;

    // Determine component name (use AST name or file name)
    const componentName = info.name || path.basename(file.path, path.extname(file.path));
    
    // Filter child components (only those starting with uppercase)
    const childComponents = info.jsxTree.filter((component: string) => /^[A-Z]/.test(component));

    // Add node to graph
    graph[componentName] = {
      file: file.path,
      children: childComponents
    };
  }

  return graph;
}

/**
 * Converts component graph to DOT format for Graphviz
 * @param graph - Component graph
 * @returns DOT representation of the graph
 */
export function graphToDot(graph: ComponentGraph): string {
  // Start building DOT code
  let dot: string = "digraph Components {\n";
  dot += "  // Graph display settings\n";
  dot += "  node [shape=box, style=filled, fillcolor=lightblue];\n";
  dot += "  edge [color=gray];\n\n";

  // Add nodes and edges
  for (const [name, data] of Object.entries(graph)) {
    // Add node label with file info
    dot += `  "${name}" [label="${name}\\n(${path.basename(data.file)})"];\n`;
    
    // Add edges to child components
    for (const child of data.children) {
      dot += `  "${name}" -> "${child}";\n`;
    }
  }

  dot += "}\n";
  return dot;
}

/**
 * Converts component graph to Markdown format
 * @param graph - Component graph  
 * @returns Markdown representation of the graph
 */
export function graphToMarkdown(graph: ComponentGraph): string {
  let md: string = "# Component Tree\n\n";
  md += "React Component Hierarchy.\n\n";

  // Process each graph node
  for (const [name, data] of Object.entries(graph)) {
    // Component header
    md += `## ${name}\n\n`;
    
    // File info
    md += `**File:** \`${data.file}\`\n\n`;

    // Child components
    if (data.children.length === 0) {
      md += "**Children:** ➡️ None\n\n";
    } else {
      md += "**Children:**\n";
      for (const child of data.children) {
        md += `- ${child}\n`;
      }
      md += "\n";
    }

    // Add separator between components
    md += "---\n\n";
  }

  return md;
}