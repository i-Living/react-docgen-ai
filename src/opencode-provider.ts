/**
 * @fileoverview LLM provider via OpenCode SDK
 * @author AI Docgen
 * @version 1.0.0
 */

import { createOpencode } from "@opencode-ai/sdk";

/** OpenCode SDK instance (lazy) */
let _instance: {
  client: import("@opencode-ai/sdk").OpencodeClient;
  server: { close(): void };
} | null = null;

/** Timeout for long generations */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Initializes OpenCode SDK (lazy singleton).
 * Starts a local server and creates a client.
 */
async function ensureInit(): Promise<void> {
  if (_instance) return;
  _instance = await createOpencode({ timeout: DEFAULT_TIMEOUT_MS });
}

/**
 * Sends prompt to LLM via OpenCode SDK.
 * Creates a single-use session, sends a message, returns the response text.
 *
 * @param prompt - Prompt text
 * @param model - Model in format "provider/model" (e.g. "openrouter/anthropic/claude-sonnet-4")
 * @returns Text response from assistant
 */
export async function callOpencode(
  prompt: string,
  model?: string,
): Promise<string> {
  await ensureInit();

  // Create session
  const sessionResp = await _instance!.client.session.create({
    body: { title: "react-docgen-ai" },
  });
  const session = sessionResp.data ?? sessionResp;
  const sessionId: string = (session as any).id ?? (session as any).data?.id;

  try {
    // Send prompt
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

    // Extract text from response parts
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
    // Clean up session
    try {
      await _instance!.client.session.delete({ path: { id: sessionId } });
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Closes OpenCode SDK and releases resources.
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
 * Checks if OpenCode SDK is initialized.
 */
export function isOpencodeInitialized(): boolean {
  return _instance !== null;
}
