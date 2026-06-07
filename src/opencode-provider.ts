/**
 * @fileoverview Провайдер LLM через OpenCode SDK
 * @author AI Docgen
 * @version 1.0.0
 */

import { createOpencode } from "@opencode-ai/sdk";

/** OpenCode SDK instance (lazy) */
let _instance: {
  client: import("@opencode-ai/sdk").OpencodeClient;
  server: { close(): void };
} | null = null;

/** Таймаут для длинных генераций */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Инициализирует OpenCode SDK (lazy singleton).
 * Запускает локальный сервер и создаёт клиент.
 */
async function ensureInit(): Promise<void> {
  if (_instance) return;
  _instance = await createOpencode({ timeout: DEFAULT_TIMEOUT_MS });
}

/**
 * Отправляет промпт в LLM через OpenCode SDK.
 * Создаёт одноразовую сессию, отправляет сообщение, возвращает текст ответа.
 *
 * @param prompt - Текст промпта
 * @param model - Модель в формате "provider/model" (e.g. "openrouter/anthropic/claude-sonnet-4")
 * @returns Текстовый ответ ассистента
 */
export async function callOpencode(
  prompt: string,
  model?: string,
): Promise<string> {
  await ensureInit();

  // Создаём сессию
  const sessionResp = await _instance!.client.session.create({
    body: { title: "react-docgen-ai" },
  });
  const session = sessionResp.data ?? sessionResp;
  const sessionId: string = (session as any).id ?? (session as any).data?.id;

  try {
    // Отправляем промпт
    const parts: Array<{ type: "text"; text: string }> = [
      { type: "text", text: prompt },
    ];
    const body: {
      parts: Array<{ type: "text"; text: string }>;
      model?: { providerID: string; modelID: string };
    } = { parts };

    if (model) {
      const slashIdx = model.indexOf("/");
      if (slashIdx > 0) {
        body.model = {
          providerID: model.slice(0, slashIdx),
          modelID: model.slice(slashIdx + 1),
        };
      }
    }

    const promptResp = await _instance!.client.session.prompt({
      path: { id: sessionId },
      body,
    });

    const responseData = promptResp.data ?? promptResp;

    // Извлекаем текст из частей ответа
    const parts_ = (
      Array.isArray(responseData)
        ? responseData
        : (responseData as any).parts ?? (responseData as any).data?.parts ?? []
    ) as Array<{ type: string; text?: string }>;

    const textParts = parts_
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!);

    return textParts.join("\n") || "";
  } finally {
    // Очищаем сессию
    try {
      await _instance!.client.session.delete({ path: { id: sessionId } });
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Закрывает OpenCode SDK и освобождает ресурсы.
 */
export function closeOpencode(): void {
  if (_instance) {
    try {
      _instance.server.close();
    } catch {
      // ignore
    }
    _instance = null;
  }
}

/**
 * Проверяет, инициализирован ли OpenCode SDK.
 */
export function isOpencodeInitialized(): boolean {
  return _instance !== null;
}
