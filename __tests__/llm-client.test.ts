/**
 * @fileoverview Тесты для модуля llm-client
 * @author AI Docgen
 * @version 1.0.0
 */

import axios from 'axios';
import { callLLM } from '../dist/llm-client.js';

// Мокаем axios для тестирования
jest.mock('axios');

describe('LLM Client', () => {
  const mockAxios = axios as jest.Mocked<typeof axios>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('callLLM', () => {
    it('should make successful API call and return cleaned response', async () => {
      const mockResponse = {
        data: {
          text: 'Some response text\n<|message|>Cleaned response content\n<|end|>'
        }
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://localhost:8000/completions',
        {
          prompt: 'test prompt',
          max_tokens: 4096,
          temperature: 0.1
        }
      );
      expect(result).toBe('Cleaned response content');
    });

    it('should handle API response with choices format', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              text: 'Response from choices format'
            }
          ]
        }
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('Response from choices format');
    });

    it('should use custom API options', async () => {
      const mockResponse = {
        data: {
          text: 'Custom options response'
        }
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const options = {
        maxTokens: 2048,
        temperature: 0.5
      };
      const result = await callLLM('http://localhost:8000/completions', 'test prompt', options);

      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://localhost:8000/completions',
        {
          prompt: 'test prompt',
          max_tokens: 2048,
          temperature: 0.5
        }
      );
      expect(result).toBe('Custom options response');
    });

    it('should clean channel markers from response', async () => {
      const mockResponse = {
        data: {
          text: '<|channel|><|start|><|message|>Response with channels<|end|>'
        }
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('Response with channels');
    });

    it('should clean markdown code blocks from response', async () => {
      const mockResponse = {
        data: {
          text: '```javascript\nconsole.log("Hello World");\n```'
        }
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('console.log("Hello World");');
    });

    it('should clean multiple markdown code blocks', async () => {
      const mockResponse = {
        data: {
          text: '```typescript\ninterface Test {\n  name: string;\n}\n```\n\nSome explanation\n\n```jsx\n<Component />\n```'
        }
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toContain('interface Test');
      expect(result).toContain('Some explanation');
      expect(result).toContain('<Component />');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('ECONNREFUSED');
      mockAxios.post.mockRejectedValue(networkError);

      await expect(callLLM('http://localhost:8000/completions', 'test prompt'))
        .rejects
        .toThrow('LLM API error: ECONNREFUSED');
    });

    it('should handle HTTP errors', async () => {
      const httpError = {
        response: {
          status: 500,
          data: { error: 'Internal Server Error' }
        },
        message: 'Request failed with status code 500'
      };
      mockAxios.post.mockRejectedValue(httpError);

      await expect(callLLM('http://localhost:8000/completions', 'test prompt'))
        .rejects
        .toThrow('LLM API error: Request failed with status code 500');
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        data: {}
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('');
    });

    it('should handle response with only whitespace', async () => {
      const mockResponse = {
        data: {
          text: '   \n\n   \t  \n   '
        }
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('');
    });

    it('should normalize newlines in response', async () => {
      const mockResponse = {
        data: {
          text: 'Line 1\n\n\n\nLine 2\n\n\n\n\nLine 3'
        }
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('Line 1\n\nLine 2\n\nLine 3');
    });

    it('should handle complex channel markers with various formats', async () => {
      const mockResponse = {
        data: {
          text: '<|channel|channel_0<|message|>First part<|end|><|channel|channel_1<|message|>Second part<|end|>'
        }
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('First partSecond part');
    });

    it('should handle mixed content with channels and code blocks', async () => {
      const mockResponse = {
        data: {
          text: '<|channel|><|message|>Here is some code:\n\n```js\nconsole.log("test");\n```\n\nAnd some text.<|end|>'
        }
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toContain('Here is some code:');
      expect(result).toContain('console.log("test");');
      expect(result).toContain('And some text.');
    });

    it('should preserve code within strings during cleaning', async () => {
      const mockResponse = {
        data: {
          text: '```js\nconsole.log("Code with // comment");\n```'
        }
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('console.log("Code with // comment");');
      expect(result).toContain('// comment');
    });

    it('should handle partial channel markers gracefully', async () => {
      const mockResponse = {
        data: {
          text: '<|channel|>Partial <|message|>Response<|end|>'
        }
      };
      mockAxios.post.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('Partial Response');
    });
  });
});