/**
 * @fileoverview Тесты для модуля llm-client
 * @author AI Docgen
 * @version 1.0.0
 */

import { callLLM } from '../src/llm-client.js';

// Mock глобального fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('LLM Client', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch;
  });

  describe('callLLM', () => {
    it('should make successful API call and return cleaned response', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          text: 'Some response text\n<|message|>Cleaned response content\n<|end|>'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/completions',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
      expect(result).toBe('Cleaned response content');
    });

    it('should handle API response with choices format', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          choices: [
            {
              text: 'Response from choices format'
            }
          ]
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('Response from choices format');
    });

    it('should use custom API options', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          text: 'Custom options response'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const options = {
        maxTokens: 2048,
        temperature: 0.5
      };
      const result = await callLLM('http://localhost:8000/completions', 'test prompt', options);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/completions',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: 'test prompt',
            max_tokens: 2048,
            temperature: 0.5
          })
        })
      );
      expect(result).toBe('Custom options response');
    });

    it('should clean channel markers from response', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          text: '<|channel|><|start|><|message|>Response with channels<|end|>'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('Response with channels');
    });

    it('should clean markdown code blocks from response', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          text: '```javascript\nconsole.log("Hello World");\n```'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('console.log("Hello World");');
    });

    it('should clean multiple markdown code blocks', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          text: '```typescript\ninterface Test {\n  name: string;\n}\n```\n\nSome explanation\n\n```jsx\n<Component />\n```'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toContain('interface Test');
      expect(result).toContain('Some explanation');
      expect(result).toContain('<Component />');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('ECONNREFUSED');
      mockFetch.mockRejectedValue(networkError);

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
      mockFetch.mockRejectedValue(httpError);

      await expect(callLLM('http://localhost:8000/completions', 'test prompt'))
        .rejects
        .toThrow('LLM API error: Request failed with status code 500');
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({})
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('');
    });

    it('should handle response with only whitespace', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          text: '   \n\n   \t  \n   '
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('');
    });

    it('should normalize newlines in response', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          text: 'Line 1\n\n\n\nLine 2\n\n\n\n\nLine 3'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('Line 1\n\nLine 2\n\nLine 3');
    });

    it('should handle complex channel markers with various formats', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          text: '<|channel|channel_0<|message|>First part<|end|><|channel|channel_1<|message|>Second part<|end|>'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('First partSecond part');
    });

    it('should handle mixed content with channels and code blocks', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          text: '<|channel|><|message|>Here is some code:\n\n```js\nconsole.log("test");\n```\n\nAnd some text.<|end|>'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toContain('Here is some code:');
      expect(result).toContain('console.log("test");');
      expect(result).toContain('And some text.');
    });

    it('should preserve code within strings during cleaning', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          text: '```js\nconsole.log("Code with // comment");\n```'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('console.log("Code with // comment");');
      expect(result).toContain('// comment');
    });

    it('should handle partial channel markers gracefully', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          text: '<|channel|>Partial <|message|>Response<|end|>'
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await callLLM('http://localhost:8000/completions', 'test prompt');

      expect(result).toBe('Partial Response');
    });
  });
});
