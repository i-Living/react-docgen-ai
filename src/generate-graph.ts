/**
 * @fileoverview Module for generating React component dependency graphs
 * @author AI Docgen
 * @version 1.0.0
 */

import { getFiles, readFile } from "./file-utils.js";
import { buildComponentGraph, graphToDot, graphToMarkdown } from "./ast/component-graph.js";
import fs from "fs";
import { CliOptions } from "./types.js";

/**
 * Generates visual representations of the project's component graph
 * Creates DOT file for Graphviz and Markdown representation
 * @param opts - CLI options
 */
export async function generateGraph(opts: CliOptions): Promise<void> {
  try {
    // Get list of all component files in the project
    const filePaths: string[] = await getFiles(opts.src, opts.extensions);

    // Convert file paths to structured format
    const files = filePaths.map((p: string) => ({
      path: p,
      content: readFile(p)
    }));

    // Build component dependency graph
    const graph = buildComponentGraph(files);

    // Convert graph to various visualization formats
    const dot: string = graphToDot(graph);
    const md: string = graphToMarkdown(graph);

    // Create output directory
    const outDir: string = opts.out + "/graph";
    fs.mkdirSync(outDir, { recursive: true });

    // Write DOT file for Graphviz
    fs.writeFileSync(outDir + "/components.dot", dot);
    
    // Write Markdown file with hierarchy description
    fs.writeFileSync(outDir + "/components.md", md);

    // Print usage instructions
    if (opts.verbose) {
      console.log("✓ Graph DOT file saved to:", outDir + "/components.dot");
      console.log("✓ Markdown tree saved to:", outDir + "/components.md");
      console.log("\n📊 To visualize the graph run:");
      console.log(`dot -Tpng ${outDir}/components.dot -o ${outDir}/components.png`);
      console.log("\n🔧 Additional formats:");
      console.log(`dot -Tsvg ${outDir}/components.dot -o ${outDir}/components.svg`);
      console.log(`dot -Tpdf ${outDir}/components.dot -o ${outDir}/components.pdf`);
    }

  } catch (error) {
    // Error handling with detailed logging
    console.error("❌ Error generating component graph:", error);
    throw error;
  }
}
