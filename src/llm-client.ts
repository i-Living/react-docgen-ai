/**
 * @fileoverview Client for LLM API interaction
 * @author AI Docgen
 * @version 1.0.0
 */

import { LlmApiOptions } from "./types.js";

/** Maximum retry attempts for HTTP errors */
const MAX_RETRIES = 3;
/** Base delay between retries (ms) */
const BASE_DELAY = 1000;
/** Opaque session id for OpenCode Go routing (`x-opencode-session`) */
const OPENCODE_SESSION =
  (process.env.LLM_OPENCODE_SESSION || "").trim() || `react-docgen-ai-${process.pid}`;

/**
 * Waits for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async function with exponential backoff.
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
 * Determines whether to retry for a given HTTP code.
 */
function isRetryableError(error: unknown): boolean {
  const msg = (error as Error)?.message ?? String(error);
  // Network errors (ECONNREFUSED, ECONNRESET, ETIMEDOUT, fetch failures)
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch\s+fail/i.test(msg)) return true;
  // 5xx — temporary server errors
  if (/5\d{2}/.test(msg)) return true;
  // 429 — rate limit
  if (/429/.test(msg)) return true;
  return false;
}

/**
 * Cleans LLM response from channel artifacts and metadata.
 * Channel markers (`<|channel|>`, `<|message|>`) are specific to
 * llama.cpp/server — cleaning is only done when they are present.
 * @param response - Raw response from LLM API
 * @returns Cleaned text without artifacts
 */
function cleanLLMResponse(response: string): string {
  let cleaned = response;

  // Channel markers — only for llama.cpp/server provider
  if (cleaned.includes("<|channel|>") || cleaned.includes("<|message|>")) {
    // First process partial channel blocks (text between channel and message)
    const partialMatch = cleaned.match(/<\|channel\|>(.*?)<\|message\|>(.*?)<\|end\|>/s);
    if (partialMatch) {
      const textBefore = partialMatch[1] || '';
      const textAfter = partialMatch[2] || '';
      cleaned = textBefore + textAfter;
    } else {
      // If no partial blocks, look for complete channel blocks
      const channelMatches = cleaned.match(/<\|channel\|>[^<]*<\|message\|>(.*?)<\|end\|>/gs);
      if (channelMatches) {
        const extractedContent = channelMatches.map(match => {
          const contentMatch = match.match(/<\|message\|>(.*?)<\|end\|>/s);
          return contentMatch ? contentMatch[1] : '';
        }).join('');
        cleaned = extractedContent;
      } else {
        // Look for message blocks only without channel
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

    // Remove residual channel markers
    cleaned = cleaned.replace(/<\|channel\|>[^<]*<\|message\|>/g, '');
    cleaned = cleaned.replace(/<\|start\|><\|channel\|>[^<]*<\|message\|>/g, '');
    cleaned = cleaned.replace(/<\|end\|>/g, '');
    cleaned = cleaned.replace(/<\|start\|>/g, '');
  }

  // Remove markdown code blocks at start
  cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/g, '');
  cleaned = cleaned.replace(/^```\n?/g, '');

  // Remove markdown code blocks at end
  cleaned = cleaned.replace(/\n?```$/g, '');

  // Remove extra newlines at start and end
  cleaned = cleaned.trim();

  // Remove duplicated newlines within text
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned;
}

/**
 * Determines whether to use chat completions format based on URL
 */
function isChatApi(api: string): boolean {
  return api.includes('chat/completions') || api.includes('v1/chat/completions');
}

/**
 * Extracts response text from chat completions format.
 * Does not use reasoning_content — these are the model's internal thoughts,
 * not meant for output.
 */
function extractChatResponse(data: any): string {
  const msg = data.choices?.[0]?.message;
  if (msg?.content) return msg.content;
  return data.choices?.[0]?.text || data.text || '';
}

/**
 * Reads streaming response from server and collects full text.
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

      // SSE format: data: {...}\n\n
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // last incomplete chunk

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
  // Destructure options with defaults
  const { 
    maxTokens = 4096, 
    temperature = 0.1,
    stream = false,
    model = "",
  } = options;

  // Determine API format by URL
  const useChat = isChatApi(api);

  // Build payload for API request
  const requestPayload: Record<string, unknown> = useChat
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

  // Add model if specified
  if (model) {
    requestPayload["model"] = model;
  }

  // Disable reasoning for thinking models (DeepSeek, GLM) via OpenCode Go relay
  if (api.includes("opencode.ai")) {
    requestPayload["thinking"] = { type: "disabled" };
  }

  return withRetry(async () => {
    // Pass API key if set (for cloud providers)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = process.env.LLM_API_KEY || '';
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    if (api.includes("opencode.ai")) {
      headers["x-opencode-session"] = OPENCODE_SESSION;
    }

    // Execute POST request to LLM API via fetch
    const response = await fetch(api, {
      method: 'POST',
      headers,
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

    // Clean response from channel artifacts and metadata
    result = cleanLLMResponse(result);
    
    return result;
  }, isRetryableError, `LLM (${api})`).catch((error: unknown) => {
    const errorMessage = (error as Error)?.message ?? String(error);
    throw new Error(`LLM API error: ${errorMessage}`);
  });
}
