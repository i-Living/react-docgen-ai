/**
 * @fileoverview Facade for selecting LLM provider (HTTP or OpenCode SDK)
 * @author AI Docgen
 * @version 1.0.0
 */

import { callLLM } from "./llm-client.js";
import { callOpencode, closeOpencode } from "./opencode-provider.js";
import { CliOptions, LlmApiOptions } from "./types.js";

/**
 * LLM provider type
 */
export type LlmProvider = "http" | "opencode";

/**
 * Determines provider from CLI options.
 * If --opencode is set, use OpenCode SDK,
 * otherwise — HTTP (current behavior).
 */
function resolveProvider(opts: CliOptions): LlmProvider {
  return opts.opencode ? "opencode" : "http";
}

/**
 * Sends prompt to LLM via selected provider.
 *
 * @param opts - CLI options (contain api URL, opencode model, etc.)
 * @param prompt - Prompt text
 * @param options - Additional LLM options
 * @param provider - Provider (determined from opts if not explicitly provided)
 */
export async function callLlm(
  opts: CliOptions,
  prompt: string,
  options?: LlmApiOptions,
  provider?: LlmProvider,
): Promise<string> {
  const actualProvider = provider ?? resolveProvider(opts);

  if (actualProvider === "opencode") {
    const model = opts.opencodeModel || opts.api || undefined;
    return await callOpencode(prompt, model);
  }

  // HTTP provider — pass stream, model and other options
  const llmOptions: LlmApiOptions = {};
  if (options?.maxTokens != null) llmOptions.maxTokens = options.maxTokens;
  else if (opts.maxTokens != null) llmOptions.maxTokens = opts.maxTokens;
  if (options?.temperature != null) llmOptions.temperature = options.temperature;
  else if (opts.temperature != null) llmOptions.temperature = opts.temperature;
  if (options?.stream != null) llmOptions.stream = options.stream;
  else if (opts.stream) llmOptions.stream = true;
  // Model: for HTTP — model name, for OpenCode — provider/model
  const model = options?.model || opts.opencodeModel || "";
  if (model) llmOptions.model = model;

  if (llmOptions && Object.keys(llmOptions).length > 0) {
    return await callLLM(opts.api, prompt, llmOptions);
  }
  return await callLLM(opts.api, prompt);
}

/**
 * Releases provider resources (if needed).
 */
export function disposeLlm(): void {
  closeOpencode();
}
