/**
 * @fileoverview Клиент для взаимодействия с LLM API
 * @author AI Docgen
 * @version 1.0.0
 */

import { LlmApiOptions } from "./types.js";

/** Максимальное количество retry-попыток для HTTP ошибок */
const MAX_RETRIES = 3;
/** Базовый интервал между retry (мс) */
const BASE_DELAY = 1000;

/**
 * Ждёт заданное количество миллисекунд.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Выполняет retry асинхронной функции с exponential backoff.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  label: string = "Request",
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      if (!shouldRetry(error) || attempt >= MAX_RETRIES) {
        throw error;
      }
      const delay = BASE_DELAY * Math.pow(2, attempt);
      console.log(`  ⏳ ${label} error, retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms:`, (error as Error)?.message || error);
      await sleep(delay);
    }
  }
  throw lastError;
}

/**
 * Определяет, стоит ли retry для данного HTTP кода.
 */
function isRetryableError(error: unknown): boolean {
  const msg = (error as Error)?.message ?? String(error);
  // Сетевые ошибки (ECONNREFUSED, ECONNRESET, ETIMEDOUT, fetch failures)
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch\s+fail/i.test(msg)) return true;
  // 5xx — временные ошибки сервера
  if (/5\d{2}/.test(msg)) return true;
  // 429 — rate limit
  if (/429/.test(msg)) return true;
  return false;
}

/**
 * Очищает ответ LLM от артефактов каналов и метаданных
 * @param response - Сырой ответ от LLM API
 * @returns Очищенный текст без артефактов
 */
function cleanLLMResponse(response: string): string {
  let cleaned = response;
  
  // Сначала обрабатываем частичные канал блоки (текст между channel и message)
  const partialMatch = cleaned.match(/<\|channel\|>(.*?)<\|message\|>(.*?)<\|end\|>/s);
  if (partialMatch) {
    const textBefore = partialMatch[1] || '';
    const textAfter = partialMatch[2] || '';
    cleaned = textBefore + textAfter;
  } else {
    // Если нет частичных блоков, ищем полные канал блоки
    const channelMatches = cleaned.match(/<\|channel\|>[^<]*<\|message\|>(.*?)<\|end\|>/gs);
    if (channelMatches) {
      const extractedContent = channelMatches.map(match => {
        const contentMatch = match.match(/<\|message\|>(.*?)<\|end\|>/s);
        return contentMatch ? contentMatch[1] : '';
      }).join('');
      cleaned = extractedContent;
    } else {
      // Ищем только message блоки без channel
      const messageMatches = cleaned.match(/<\|message\|>(.*?)<\|end\|>/gs);
      if (messageMatches) {
        const extractedContent = messageMatches.map(match => {
          const contentMatch = match.match(/<\|message\|>(.*?)<\|end\|>/s);
          return contentMatch ? contentMatch[1] : '';
        }).join('');
        cleaned = extractedContent;
      }
    }
  }
  
  // Удаляем остаточные канал маркеры
  cleaned = cleaned.replace(/<\|channel\|>[^<]*<\|message\|>/g, '');
  cleaned = cleaned.replace(/<\|start\|><\|channel\|>[^<]*<\|message\|>/g, '');
  cleaned = cleaned.replace(/<\|end\|>/g, '');
  cleaned = cleaned.replace(/<\|start\|>/g, '');
  
  // Удаляем markdown блоки кода в начале
  cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/g, '');
  cleaned = cleaned.replace(/^```\n?/g, '');
  
  // Удаляем markdown блоки кода в конце
  cleaned = cleaned.replace(/\n?```$/g, '');
  
  // Удаляем лишние переносы строк в начале и конце
  cleaned = cleaned.trim();
  
  // Удаляем дублированные переносы строк внутри текста
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  return cleaned;
}

/**
 * Определяет, использовать ли chat completions формат по URL
 */
function isChatApi(api: string): boolean {
  return api.includes('chat/completions') || api.includes('v1/chat/completions');
}

/**
 * Извлекает текст ответа из chat completions формата
 */
function extractChatResponse(data: any): string {
  return data.choices?.[0]?.message?.content || data.choices?.[0]?.text || data.text || '';
}

/**
 * Читает streaming-ответ от сервера и собирает полный текст.
 */
async function readStreamingResponse(response: Response, useChat: boolean): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming not supported: response body is null");
  }

  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE формат: data: {...}\n\n
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // последняя незавершённая часть

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === "[DONE]") continue;

        try {
          const parsed = JSON.parse(jsonStr);
          // Chat completions: choices[0].delta.content
          if (useChat) {
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (delta) fullText += delta;
          } else {
            // completion API: choices[0].text
            const text = parsed?.choices?.[0]?.text;
            if (text) fullText += text;
          }
        } catch {
          // skip malformed JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

export async function callLLM(
  api: string, 
  prompt: string, 
  options: LlmApiOptions = {}
): Promise<string> {
  // Деструктурируем опции с значениями по умолчанию
  const { 
    maxTokens = 4096, 
    temperature = 0.1,
    stream = false,
  } = options;

  // Определяем формат API по URL
  const useChat = isChatApi(api);

  // Формируем payload для отправки в API
  const requestPayload = useChat
    ? {
        messages: [{ role: 'user' as const, content: prompt }],
        max_tokens: maxTokens,
        temperature,
        stream,
      }
    : {
        prompt,
        max_tokens: maxTokens,
        temperature,
        stream,
      };

  return withRetry(async () => {
    // Выполняем POST запрос к LLM API через fetch
    const response = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    let result: string;

    if (stream) {
      // Streaming mode
      result = await readStreamingResponse(response, useChat);
    } else {
      const data: any = await response.json();
      result = useChat
        ? extractChatResponse(data)
        : data.text || data.choices?.[0]?.text || '';
    }

    // Очищаем ответ от артефактов каналов и метаданных
    result = cleanLLMResponse(result);
    
    return result;
  }, isRetryableError, `LLM (${api})`).catch((error: unknown) => {
    const errorMessage = (error as Error)?.message ?? String(error);
    throw new Error(`LLM API error: ${errorMessage}`);
  });
}
