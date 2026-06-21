/** 
 * @fileoverview Command-line interface for react-docgen-ai
 * @author AI Docgen
 * @version 1.0.0
 */

import { Command } from "commander";
import { disposeLlm } from "./llm.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { annotateProject, annotateInPlace } from "./annotator.js";
import { generateGraph } from "./generate-graph.js";
import { generateWiki } from "./wiki-generator.js";
import { CliOptions } from "./types.js";
import { readEnv, readEnvInt, readEnvFloat } from "./env.js";

// -- Env defaults --
const DEFAULT_API       = readEnv("LLM_API_URL", "http://localhost:8000/completions");
const DEFAULT_MAX_TOKENS = String(readEnvInt("LLM_MAX_TOKENS", 4096));
const DEFAULT_TEMP       = String(readEnvFloat("LLM_TEMPERATURE", 0.1));
const DEFAULT_OUT        = readEnv("DOCGEN_OUT", "./ai-output");
const DEFAULT_EXTENSIONS = readEnv("DOCGEN_EXTENSIONS", "js,jsx,ts,tsx");
const DEFAULT_PARALLEL   = String(readEnvInt("DOCGEN_PARALLEL", 4));
const DEFAULT_WIKI       = readEnv("DOCGEN_WIKI", "");

/**
 * Resolves wiki path from CLI argument.
 * - `--wiki ./path` -> ./path
 * - `--wiki` (no value) -> ./wiki
 * - none -> undefined (disabled) or env value
 */
function resolveWiki(wikiOpt: string | boolean | undefined): string | undefined {
  if (wikiOpt === true) {
    return "./wiki";
  }
  if (typeof wikiOpt === "string" && wikiOpt.trim()) {
    return wikiOpt.trim();
  }
  return undefined;
}

// -- Version from package.json --
let PKG_VERSION = "1.0.0";
try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));
  PKG_VERSION = pkg.version || PKG_VERSION;
} catch {
  // fallback to hardcoded
}

const program = new Command();

program
  .name("react-docgen-ai")
  .description("Automatic documentation and annotation of React code using LLM")
  .version(PKG_VERSION);

program
  .requiredOption("-s, --src <path>", "Path to source directory or single file with React components")
  .option("-o, --out <path>", "Output directory for results", DEFAULT_OUT)
  .option("--annotate", "Annotate code by adding detailed comments")
  .option("--annotate-inplace", "Annotate code directly in source files")
  .option("--graph", "Generate component dependency graph (DOT and Markdown)")
  .option("-e, --extensions <exts>", "File extensions to process", DEFAULT_EXTENSIONS)
  .option("--api <url>", "LLM API URL (OpenAI-compatible endpoint)", DEFAULT_API)
  .option("--opencode", "Use OpenCode SDK instead of HTTP LLM calls", false)
  .option("--opencode-model <model>", "LLM model (model name for HTTP or provider/model format for OpenCode SDK)", readEnv("LLM_API_MODEL", ""))
  .option("--max-tokens <number>", "Maximum tokens for LLM requests", DEFAULT_MAX_TOKENS)
  .option("--temperature <number>", "LLM generation temperature (0.0 - 1.0)", DEFAULT_TEMP)
  .option("--force", "Force process files with @fileoverview", false)
  .option("--parallel <number>", "Number of parallel LLM requests", DEFAULT_PARALLEL)
  .option("--prompt-dir <path>", "Directory with custom prompt files")
  .option("--dry-run", "Dry run mode (no LLM calls or writes)", false)
  .option("--stream", "Enable streaming for HTTP provider", false)
  .option("--wiki [path]", "Generate LLM Wiki (Obsidian-compatible docs) to specified directory", DEFAULT_WIKI || undefined)
  .option("--verbose", "Verbose output of process information", false)
  .option("--quiet", "Quiet mode — minimal logging", false);

program.action(async (opts: Record<string, any>) => {
  try {
    if (!opts.annotate && !opts.annotateInplace && !opts.graph && !opts.wiki) {
      console.log("Error: Choose at least one option: --annotate, --annotate-inplace, --graph or --wiki");
      console.log("\nUsage:");
      console.log("  react-docgen-ai --src ./src --annotate");
      console.log("  react-docgen-ai --src ./src --annotate-inplace");
      console.log("  react-docgen-ai --src ./src --graph");
      console.log("  react-docgen-ai --src ./src --wiki");
      
      process.exit(1);
    }

    const resolvedWiki = resolveWiki(opts.wiki);
    const normalized: CliOptions = {
      src: opts.src,
      out: opts.out,
      annotate: opts.annotate ?? false,
      annotateInplace: opts.annotateInplace ?? false,
      graph: opts.graph ?? false,
      extensions: opts.extensions,
      api: opts.api,
      force: opts.force ?? false,
      opencode: opts.opencode ?? false,
      opencodeModel: opts.opencodeModel ?? "",
      parallel: parseInt(opts.parallel, 10) || 4,
      promptDir: opts.promptDir || undefined,
      dryRun: opts.dryRun ?? false,
      stream: opts.stream ?? false,
      maxTokens: parseInt(opts.maxTokens, 10) || undefined,
      temperature: parseFloat(opts.temperature) || undefined,
      verbose: opts.verbose ?? false,
      quiet: opts.quiet ?? false,
      ...(resolvedWiki ? { wiki: resolvedWiki } : {}),
    };

    if (opts.dryRun) {
      console.log("\n===== DRY RUN MODE =====");
      console.log("  Files will be scanned but no LLM calls or writes will be made.\n");
    }

    if (opts.annotate) {
      await annotateProject(normalized);
    }

    if (opts.annotateInplace) {
      await annotateInPlace(normalized);
    }

    if (opts.graph) {
      await generateGraph(normalized);
    }

    if (resolvedWiki) {
      await generateWiki(normalized, resolvedWiki);
    }

    if (!opts.dryRun && !opts.quiet) {
      console.log("\nAll operations completed successfully!");
    }
  } catch (error) {
    console.error("Fatal error:", error);

    if (error instanceof Error) {
      if (error.message.includes("EACCES")) {
        console.log("\nPossible insufficient permissions.");
      } else if (error.message.includes("ENOENT")) {
        console.log("\nPossibly a non-existent path.");
      }
    }

    process.exit(1);
  } finally {
    disposeLlm();
  }
});

program.on("command:*", () => {
  console.error("Unknown command. Use --help.");
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\n\nInterrupt signal received. Shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n\nTermination signal received. Shutting down...");
  process.exit(0);
});

program.parse(process.argv);
