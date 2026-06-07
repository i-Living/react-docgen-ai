/**
 * @fileoverview Фасад для выбора провайдера LLM (HTTP или OpenCode SDK)
 * @author AI Docgen
 * @version 1.0.0
 */

import { callLLM } from "./llm-client.js";
import { callOpencode, closeOpencode } from "./opencode-provider.js";
import { CliOptions, LlmApiOptions } from "./types.js";

/**
 * Тип провайдера LLM
 */
export type LlmProvider = "http" | "opencode";

/**
 * Определяет провайдера по опциям CLI.
 * Если указан --opencode, используем OpenCode SDK,
 * иначе — HTTP (существующее поведение).
 */
function resolveProvider(opts: CliOptions): LlmProvider {
  return opts.opencode ? "opencode" : "http";
}

/**
 * Отправляет промпт в LLM через выбранный провайдер.
 *
 * @param opts - Опции CLI (содержат api URL, opencode модель и т.д.)
 * @param prompt - Текст промпта
 * @param options - Дополнительные опции LLM
 * @param provider - Провайдер (определяется из opts, если не указан явно)
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

  // HTTP провайдер — передаём stream и другие опции
  const llmOptions: LlmApiOptions = {};
  if (options?.maxTokens != null) llmOptions.maxTokens = options.maxTokens;
  if (options?.temperature != null) llmOptions.temperature = options.temperature;
  if (options?.stream != null) llmOptions.stream = options.stream;
  else if (opts.stream) llmOptions.stream = true;

  if (llmOptions && Object.keys(llmOptions).length > 0) {
    return await callLLM(opts.api, prompt, llmOptions);
  }
  return await callLLM(opts.api, prompt);
}

/**
 * Освобождает ресурсы провайдера (если нужно).
 */
export function disposeLlm(): void {
  closeOpencode();
}
