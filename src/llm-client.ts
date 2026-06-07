/**
 * @fileoverview Клиент для взаимодействия с LLM API
 * @author AI Docgen
 * @version 1.0.0
 */

import axios from "axios";
import { LlmApiOptions } from "./types.js";

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
    const channelMatches = cleaned.match(/<\|channel\|[^<]*<\|message\|>(.*?)<\|end\|>/gs);
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
  cleaned = cleaned.replace(/<\|channel\|[^<]*<\|message\|>/g, '');
  cleaned = cleaned.replace(/<\|start\|><\|channel\|[^<]*<\|message\|>/g, '');
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
 * Выполняет запрос к LLM API
 * @param api - URL API эндпоинта
 * @param prompt - Промпт для отправки в LLM
 * @param options - Дополнительные опции API
 * @returns Promise с текстовым ответом от LLM
 */
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

export async function callLLM(
  api: string, 
  prompt: string, 
  options: LlmApiOptions = {}
): Promise<string> {
  // Деструктурируем опции с значениями по умолчанию
  const { 
    maxTokens = 4096, 
    temperature = 0.1 
  } = options;

  // Определяем формат API по URL
  const useChat = isChatApi(api);

  // Формируем payload для отправки в API
  const requestPayload = useChat
    ? {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature
      }
    : {
        prompt,
        max_tokens: maxTokens,
        temperature
      };

  try {
    // Выполняем POST запрос к LLM API
    const response = await axios.post(api, requestPayload);
    
    // Извлекаем текст ответа из различных возможных форматов API
    let result = useChat
      ? extractChatResponse(response.data)
      : response.data.text || response.data.choices?.[0]?.text || '';
    
    // Очищаем ответ от артефактов каналов и метаданных
    result = cleanLLMResponse(result);
    
    return result;
  } catch (error: any) {
    // Логируем ошибку и перебрасываем исключение
    console.error('Ошибка при обращении к LLM API:', error);
    const errorMessage = error.message || error.toString();
    throw new Error(`LLM API error: ${errorMessage}`);
  }
}