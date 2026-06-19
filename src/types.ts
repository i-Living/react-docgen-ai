/**
 * @fileoverview Base types and interfaces for react-docgen-ai
 * @author AI Docgen
 * @version 1.0.0
 */

/**
 * Interface for CLI options
 */
export interface CliOptions {
  /** Source directory path */
  src: string;
  /** Output directory */
  out: string;
  /** Whether to annotate code with comments */
  annotate: boolean;
  /** Whether to annotate code in-place */
  annotateInplace?: boolean;
  /** Whether to generate documentation */
  docs: boolean;
  /** Whether to generate component graph */
  graph: boolean;
  /** List of file extensions */
  extensions: string;
  /** URL for LLM API */
  api: string;
  /** Force process files with @fileoverview */
  force?: boolean;
  /** Use OpenCode SDK instead of HTTP */
  opencode?: boolean;
  /** Model for LLM (format: provider/model for OpenCode SDK, or model name for HTTP) */
  opencodeModel?: string;
  /** Number of parallel LLM requests (default 4) */
  parallel?: number;
  /** Directory with custom prompts */
  promptDir?: string;
  /** Dry-run mode (no LLM calls or writes) */
  dryRun?: boolean;
  /** Documentation output format */
  format?: OutputFormat;
  /** Use streaming for HTTP provider */
  stream?: boolean;
  /** Maximum tokens for LLM requests */
  maxTokens?: number | undefined;
  /** LLM generation temperature (0.0 - 1.0) */
  temperature?: number | undefined;
  /** Directory for LLM Wiki generation (Karpathy-style) */
  wiki?: string;
  /** Verbose output (default false) */
  verbose?: boolean;
  /** Quiet mode — minimal logging (default false) */
  quiet?: boolean;
}

/** Documentation output format */
export type OutputFormat = "markdown" | "json";

/**
 * File type determined via AST analysis.
 * Used for:
 * - Selecting type-specific prompt (step 3)
 * - Skipping files without useful content (saves LLM tokens)
 * - Compact representation (step 4)
 */
export type FileType = "component" | "hook" | "context" | "store" | "util" | "types" | "skip";

/**
 * Interface for React component info extracted from AST
 */
export interface ComponentInfo {
  /** Component name */
  name: string | null;
  /** Props list */
  props: ComponentProp[];
  /** State list */
  state: ComponentState[];
  /** Effects list */
  effects: ComponentEffect[];
  /** Event handlers */
  handlers: ComponentHandler[];
  /** JSX element tree */
  jsxTree: string[];
  /** Whether file exports a default component */
  exportsComponent: boolean;
  /** File type determined via AST (component/hook/context/util/types/skip) */
  fileType: FileType;
  /** Found createContext (React Context) */
  hasContext: boolean;
  /** Found state management (Zustand/Jotai/Redux) */
  hasStore: boolean;
}

/**
 * Interface for component props
 */
export interface ComponentProp {
  /** Prop name */
  name: string;
  /** Prop type */
  type?: string;
  /** Is prop required */
  required?: boolean;
  /** Default value */
  defaultValue?: unknown;
}

/**
 * Interface for component state
 */
export interface ComponentState {
  /** State variable name */
  variable: string;
  /** Initial value */
  initialValue?: unknown;
}

/**
 * Interface for component effects
 */
export interface ComponentEffect {
  /** Effect dependencies */
  deps: string[];
  /** Additional effect options */
  options?: unknown;
}

/**
 * Interface for event handlers
 */
export interface ComponentHandler {
  /** Handler name */
  name: string;
  /** Handler parameters */
  params?: string[];
  /** Event type (if applicable) */
  eventType?: string;
}

/**
 * Interface for files in component graph
 */
export interface FileInfo {
  /** File path */
  path: string;
  /** File content */
  content: string;
}

/**
 * Interface for node in component graph
 */
export interface GraphNode {
  /** Component file path */
  file: string;
  /** Child components */
  children: string[];
}

/**
 * Type for component graph
 */
export type ComponentGraph = Record<string, GraphNode>;

/**
 * Options for LLM API call
 */
export interface LlmApiOptions {
  /** Maximum tokens */
  maxTokens?: number;
  /** Generation temperature */
  temperature?: number;
  /** Use streaming */
  stream?: boolean;
  /** Model for HTTP provider (e.g. glm-5.2, deepseek-v4-flash) */
  model?: string;
}

/**
 * Result of processing one file in pipeline
 */
export interface FileResult {
  file: string;
  success: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
  outputPath?: string;
}
