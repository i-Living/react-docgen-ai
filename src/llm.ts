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
 * @param api - URL API (для HTTP провайдера) или модель (для OpenCode)
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
    // OpenCode SDK: opts.api содержит имя модели
    // (переопределяется через --api для обратной совместимости)
    const model = opts.opencodeModel || opts.api || undefined;
    return await callOpencode(prompt, model);
  }

  // HTTP провайдер (существующее поведение)
  if (options && Object.keys(options).length > 0) {
    return await callLLM(opts.api, prompt, options);
  }
  return await callLLM(opts.api, prompt);
}

/**
 * Освобождает ресурсы провайдера (если нужно).
 */
export function disposeLlm(): void {
  closeOpencode();
}
