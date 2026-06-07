/**
 * @fileoverview Тесты для модуля prompt-loader
 * @author AI Docgen
 * @version 1.0.0
 */

import path from 'path';
import fs from 'fs';

// Import the source files, not the dist files
import { loadPrompt, getAnnotationPrompt, getDocumentationPrompt } from '../src/prompt-loader';

describe('Prompt Loader', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('loadPrompt', () => {
    const testPromptPath = path.join(process.cwd(), 'src', 'prompts', 'test.txt');
    const testPromptContent = 'This is a test prompt with {{KEY}} placeholder';
    
    it('should load prompt from file and replace placeholders', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(testPromptContent);
      
      const result = loadPrompt('test', { KEY: 'replaced value' });
      
      expect(fs.readFileSync).toHaveBeenCalledWith(testPromptPath, 'utf8');
      expect(result).toBe('This is a test prompt with replaced value placeholder');
    });

    it('should handle multiple placeholders', () => {
      const contentWithMultiplePlaceholders = 'First: {{KEY1}}, Second: {{KEY2}}, Third: {{KEY3}}';
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(contentWithMultiplePlaceholders);
      
      const result = loadPrompt('test', {
        KEY1: 'value1',
        KEY2: 'value2',
        KEY3: 'value3'
      });
      
      expect(result).toBe('First: value1, Second: value2, Third: value3');
    });

    it('should throw error when prompt file does not exist', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      
      expect(() => loadPrompt('nonexistent', {})).toThrow('Промпт не найден:');
    });

    it('should handle empty replacements object', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(testPromptContent);
      
      const result = loadPrompt('test', {});
      
      expect(result).toBe('This is a test prompt with {{KEY}} placeholder');
    });

    it('should handle prompts with no placeholders', () => {
      const contentWithoutPlaceholders = 'This prompt has no placeholders';
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(contentWithoutPlaceholders);
      
      const result = loadPrompt('test', { ANY_KEY: 'value' });
      
      expect(result).toBe('This prompt has no placeholders');
    });

    it('should escape special regex characters in placeholders', () => {
      const contentWithSpecialChars = 'Prompt with {{KEY[0]}} and {{KEY[1]}}';
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(contentWithSpecialChars);
      
      const result = loadPrompt('test', { 'KEY[0]': 'value0', 'KEY[1]': 'value1' });
      
      expect(result).toBe('Prompt with value0 and value1');
    });

    it('should handle multiline prompts', () => {
      const multilineContent = `Line 1 with {{KEY1}}
Line 2 with {{KEY2}}
Line 3 with {{KEY3}}`;
      
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(multilineContent);
      
      const result = loadPrompt('test', {
        KEY1: 'replaced1',
        KEY2: 'replaced2',
        KEY3: 'replaced3'
      });
      
      const expected = `Line 1 with replaced1
Line 2 with replaced2
Line 3 with replaced3`;
      
      expect(result).toBe(expected);
    });
  });

  describe('getAnnotationPrompt', () => {
    const astInfo = {
      name: 'Button',
      props: [{ name: 'text', type: 'string' }],
      state: [{ variable: 'isLoading' }],
      effects: [{ deps: ['isLoading'] }],
      handlers: [],
      jsxTree: ['button'],
      exportsComponent: true
    };

    const componentCode = 'function Button() { return <button>Click</button>; }';

    it('should generate annotation prompt with AST info and code', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('AST_INFO: {{AST_INFO}}\nCODE: {{CODE}}');
      
      const result = getAnnotationPrompt(astInfo, componentCode);
      
      expect(result).toContain('AST_INFO:');
      expect(result).toContain('CODE:');
      expect(result).toContain(JSON.stringify(astInfo, null, 2));
      expect(result).toContain(componentCode);
    });

    it('should handle complex AST info', () => {
      const complexAstInfo = {
        name: 'ComplexComponent',
        props: [
          { name: 'title', type: 'string', required: true },
          { name: 'items', type: 'Array<string>' },
          { name: 'onSubmit', type: 'function', required: false }
        ],
        state: [
          { variable: 'isLoading' },
          { variable: 'error' },
          { variable: 'formData' }
        ],
        effects: [
          { deps: ['isLoading', 'error'] },
          { deps: [] }
        ],
        handlers: [
          { name: 'handleSubmit', params: ['event'] },
          { name: 'handleReset', params: [] }
        ],
        jsxTree: ['div', 'form', 'input', 'button', 'ErrorMessage'],
        exportsComponent: true
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{{AST_INFO}}\n{{CODE}}');
      
      const result = getAnnotationPrompt(complexAstInfo, componentCode);
      
      expect(result).toContain(JSON.stringify(complexAstInfo, null, 2));
      expect(result).toContain(componentCode);
    });

    it('should handle empty AST info', () => {
      const emptyAstInfo = {
        name: null,
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: [],
        exportsComponent: false
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{{AST_INFO}}\n{{CODE}}');
      
      const result = getAnnotationPrompt(emptyAstInfo, componentCode);
      
      expect(result).toContain(JSON.stringify(emptyAstInfo, null, 2));
      expect(result).toContain(componentCode);
    });
  });

  describe('getDocumentationPrompt', () => {
    const astInfo = {
      name: 'UserCard',
      props: [{ name: 'user', type: 'User' }],
      state: [],
      effects: [],
      handlers: [],
      jsxTree: ['div', 'Avatar', 'h3', 'p'],
      exportsComponent: true
    };

    const componentCode = 'const UserCard = ({ user }) => <div><Avatar />{user.name}</div>';

    it('should generate documentation prompt with AST info and code', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('Generate docs for:\n{{AST_INFO}}\n{{CODE}}');
      
      const result = getDocumentationPrompt(astInfo, componentCode);
      
      expect(result).toContain('Generate docs for:');
      expect(result).toContain(JSON.stringify(astInfo, null, 2));
      expect(result).toContain(componentCode);
    });

    it('should handle TypeScript interfaces in props', () => {
      const tsAstInfo = {
        name: 'FormField',
        props: [
          { name: 'label', type: 'string', required: true },
          { name: 'value', type: 'string', required: true },
          { name: 'onChange', type: '(value: string) => void', required: true },
          { name: 'error', type: 'string | undefined', required: false },
          { name: 'disabled', type: 'boolean', required: false }
        ],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: ['div', 'label', 'input', 'span'],
        exportsComponent: true
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('Document TypeScript component:\n{{AST_INFO}}\n{{CODE}}');
      
      const result = getDocumentationPrompt(tsAstInfo, componentCode);
      
      expect(result).toContain(JSON.stringify(tsAstInfo, null, 2));
      expect(result).toContain(componentCode);
    });

    it('should handle component with multiple useEffect hooks', () => {
      const effectAstInfo = {
        name: 'DataLoader',
        props: [{ name: 'endpoint', type: 'string' }],
        state: [
          { variable: 'data' },
          { variable: 'loading' },
          { variable: 'error' }
        ],
        effects: [
          { deps: ['endpoint'] },
          { deps: ['data', 'loading'] }
        ],
        handlers: [],
        jsxTree: ['div', 'Spinner', 'ErrorMessage', 'DataTable'],
        exportsComponent: true
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{{AST_INFO}}\n{{CODE}}');
      
      const result = getDocumentationPrompt(effectAstInfo, componentCode);
      
      expect(result).toContain(JSON.stringify(effectAstInfo, null, 2));
    });
  });
});