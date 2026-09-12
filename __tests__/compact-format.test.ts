import { describe, it, expect } from 'bun:test';
import { toCompactAst, shouldIncludeCode, buildPromptPayload } from '../src/ast/compact-format';
import { ComponentInfo, FileType } from '../src/types';

describe('compact-format', () => {
  describe('toCompactAst', () => {
    it('should format a component with all fields', () => {
      const info: ComponentInfo = {
        name: 'Button',
        props: [
          { name: 'label', type: 'string', required: true },
          { name: 'disabled', type: 'boolean', required: false },
        ],
        state: [{ variable: 'isOpen' }],
        effects: [{ deps: ['data', 'loading'] }],
        handlers: [{ name: 'handleClick' }],
        jsxTree: ['div', 'button', 'span', 'button'],
        exportsComponent: true,
        fileType: 'component',
        hasContext: false,
        hasStore: false,
      };

      const result = toCompactAst(info);

      expect(result).toContain('Type: component');
      expect(result).toContain('Name: Button');
      expect(result).toContain('Exports: true');
      expect(result).toContain('label: string');
      expect(result).toContain('disabled?: boolean');
      expect(result).toContain('State: [isOpen]');
      expect(result).toContain('useEffect([data, loading])');
      expect(result).toContain('Handlers: [handleClick]');
      // JSX should deduplicate
      expect(result).toContain('JSX: <div>, <button>, <span>');
      expect(result).not.toContain('<button>, <button>');
    });

    it('should format a hook with minimal fields', () => {
      const info: ComponentInfo = {
        name: 'useToggle',
        props: [],
        state: [{ variable: 'value' }],
        effects: [],
        handlers: [],
        jsxTree: [],
        exportsComponent: true,
        fileType: 'hook',
        hasContext: false,
        hasStore: false,
      };

      const result = toCompactAst(info);

      expect(result).toContain('Type: hook');
      expect(result).toContain('Name: useToggle');
      expect(result).toContain('State: [value]');
      expect(result).not.toContain('Props:');
      expect(result).not.toContain('JSX:');
    });

    it('should include context detection', () => {
      const info: ComponentInfo = {
        name: null,
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: [],
        exportsComponent: false,
        fileType: 'context',
        hasContext: true,
        hasStore: false,
      };

      const result = toCompactAst(info);

      expect(result).toContain('Type: context');
      expect(result).toContain('Context: createContext detected');
    });

    it('should include store detection', () => {
      const info: ComponentInfo = {
        name: null,
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: [],
        exportsComponent: false,
        fileType: 'store',
        hasContext: false,
        hasStore: true,
      };

      const result = toCompactAst(info);

      expect(result).toContain('Type: store');
      expect(result).toContain('Store: state management detected');
    });

    it('should include default values in props', () => {
      const info: ComponentInfo = {
        name: 'Input',
        props: [{ name: 'type', type: 'string', defaultValue: 'text' }],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: ['input'],
        exportsComponent: true,
        fileType: 'component',
        hasContext: false,
        hasStore: false,
      };

      const result = toCompactAst(info);

      expect(result).toContain("type?: string = \"text\"");
    });

    it('should handle skip file type', () => {
      const info: ComponentInfo = {
        name: null,
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: [],
        exportsComponent: false,
        fileType: 'skip',
        hasContext: false,
        hasStore: false,
      };

      const result = toCompactAst(info);

      expect(result).toContain('Type: skip');
      expect(result).toContain('Exports: false');
    });
  });

  describe('shouldIncludeCode', () => {
    it('should return true for short files', () => {
      const code = 'line\n'.repeat(99) + 'line';
      expect(shouldIncludeCode(code)).toBe(true);
    });

    it('should return true at the omit threshold (400 lines)', () => {
      const code = 'line\n'.repeat(399) + 'line';
      expect(shouldIncludeCode(code)).toBe(true);
    });

    it('should return false for files over 400 lines', () => {
      const code = 'line\n'.repeat(401);
      expect(shouldIncludeCode(code)).toBe(false);
    });

    it('should return true for empty file', () => {
      expect(shouldIncludeCode('')).toBe(true);
    });
  });

  describe('buildPromptPayload', () => {
    it('should include code for long files', () => {
      const info: ComponentInfo = {
        name: 'BigComponent',
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: ['div'],
        exportsComponent: true,
        fileType: 'component',
        hasContext: false,
        hasStore: false,
      };
      const code = 'x\n'.repeat(150);

      const payload = buildPromptPayload(info, code);

      expect(payload.CODE).toBe(code);
      expect(payload.AST_INFO).toContain('Name: BigComponent');
    });

    it('should include code for files under the omit threshold', () => {
      const info: ComponentInfo = {
        name: 'SmallComponent',
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: ['div'],
        exportsComponent: true,
        fileType: 'component',
        hasContext: false,
        hasStore: false,
      };
      const code = 'const x = 1;';

      const payload = buildPromptPayload(info, code);

      expect(payload.CODE).toBe(code);
      expect(payload.AST_INFO).toContain('Name: SmallComponent');
    });

    it('should omit code for extremely long files', () => {
      const info: ComponentInfo = {
        name: 'HugeComponent',
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: ['div'],
        exportsComponent: true,
        fileType: 'component',
        hasContext: false,
        hasStore: false,
      };
      const code = 'x\n'.repeat(401);

      const payload = buildPromptPayload(info, code);

      expect(payload.CODE).toContain('code omitted');
      expect(payload.AST_INFO).toContain('Name: HugeComponent');
    });
  });
});
