/**
 * @fileoverview Тесты для модуля file-utils
 * @author AI Docgen
 * @version 1.0.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import path from 'path';
import fs from 'fs';
import {
  getFiles,
  readFile,
  writeOutput,
  writeInPlace,
  hasFileoverview,
  removeComments,
  hasCodeChanges,
  hashContent,
} from '../src/file-utils.js';

const TMP = path.join(process.cwd(), '__test_fs__');

describe('File Utils — pure functions (no fs)', () => {
  describe('hasFileoverview', () => {
    it('should return true for files with @fileoverview', () => {
      const code = `/**
 * @fileoverview Test component
 */
export default function Test() { return <div>Test</div>; }`;
      expect(hasFileoverview(code)).toBe(true);
    });

    it('should return false for files without @fileoverview', () => {
      const code = `export default function Test() { return <div>Test</div>; }`;
      expect(hasFileoverview(code)).toBe(false);
    });

    it('should only check first 500 characters', () => {
      const longContent = 'a'.repeat(400) + '\n@fileoverview\n' + 'b'.repeat(200);
      expect(hasFileoverview(longContent)).toBe(true);
    });

    it('should return false when @fileoverview is beyond 500 characters', () => {
      const longContent = 'a'.repeat(500) + '\n@fileoverview';
      expect(hasFileoverview(longContent)).toBe(false);
    });
  });

  describe('removeComments', () => {
    it('should remove single-line comments', () => {
      const code = `// This is a comment\nconst x = 5; // inline\nconst y = 10;`;
      const result = removeComments(code);
      expect(result).toContain('const x = 5;');
      expect(result).toContain('const y = 10;');
      expect(result).not.toContain('// This is a comment');
    });

    it('should remove multi-line comments', () => {
      const code = `/* Block */\nconst x = 5;\n/** JSDoc */\nconst y = 10;`;
      const result = removeComments(code);
      expect(result).toContain('const x = 5;');
      expect(result).toContain('const y = 10;');
      expect(result).not.toContain('Block');
      expect(result).not.toContain('JSDoc');
    });

    it('should preserve string literals', () => {
      const code = `const s = "// not a comment"; const s2 = "/* not a comment */";`;
      const result = removeComments(code);
      expect(result).toContain('// not a comment');
      expect(result).toContain('/* not a comment */');
    });
  });

  describe('hasCodeChanges', () => {
    it('should return false when only comments differ', () => {
      expect(hasCodeChanges('// old\nconst x = 5;', '/** new */\nconst x = 5;')).toBe(false);
    });

    it('should return true when code structure changed', () => {
      expect(hasCodeChanges('const x = 5;', 'const x = 10;')).toBe(true);
    });
  });

  describe('hashContent', () => {
    it('should return consistent hash for same input', () => {
      expect(hashContent('hello')).toBe(hashContent('hello'));
    });

    it('should return different hash for different input', () => {
      expect(hashContent('hello')).not.toBe(hashContent('world'));
    });

    it('should return 16-character hex string', () => {
      expect(hashContent('test')).toMatch(/^[a-f0-9]{16}$/);
    });
  });
});

describe('File Utils — integration (temp files)', () => {
  // Создаём временные файлы для настоящего fs
  const dir = path.join(TMP, 'file-utils-test');
  const srcFile = path.join(dir, 'source.ts');
  const outDir = path.join(dir, 'output');
  const content = 'console.log("hello");';

  beforeAll(() => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(srcFile, content, 'utf-8');
    fs.writeFileSync(path.join(dir, 'test.txt'), 'text content', 'utf-8');
    // Поддиректория с расширениями для getFiles
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'comp.tsx'), '', 'utf-8');
    fs.writeFileSync(path.join(srcDir, 'styles.css'), '', 'utf-8');
    fs.writeFileSync(path.join(srcDir, 'util.ts'), '', 'utf-8');
  });

  afterAll(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
  });

  describe('readFile', () => {
    it('should read file content correctly', () => {
      expect(readFile(srcFile)).toBe(content);
    });

    it('should throw on non-existent file', () => {
      expect(() => readFile(path.join(dir, 'nope.ts'))).toThrow();
    });
  });

  describe('writeOutput', () => {
    it('should create output directory and write file', () => {
      const result = writeOutput(outDir, srcFile, content);
      expect(fs.existsSync(result)).toBe(true);
      expect(readFile(result)).toBe(content);
    });
  });

  describe('writeInPlace', () => {
    it('should overwrite file content in place', () => {
      const test = path.join(dir, 'inplace-test.txt');
      fs.writeFileSync(test, 'original', 'utf-8');
      writeInPlace(test, 'modified');
      expect(readFile(test)).toBe('modified');
    });
  });

  describe('getFiles', () => {
    it('should filter by extensions', async () => {
      const srcDir = path.join(dir, 'src');
      const files = await getFiles(srcDir, 'ts,tsx');
      expect(files).not.toContain(path.join(srcDir, 'styles.css'));
      expect(files).toContain(path.join(srcDir, 'comp.tsx'));
      expect(files).toContain(path.join(srcDir, 'util.ts'));
    });

    it('should handle single file', async () => {
      const files = await getFiles(srcFile, 'ts,tsx');
      expect(files).toHaveLength(1);
      expect(files[0]).toBe(srcFile);
    });

    it('should reject invalid extension file', async () => {
      await expect(getFiles(path.join(dir, 'test.txt'), 'ts')).rejects.toThrow();
    });

    it('should reject non-existent path', async () => {
      await expect(getFiles(path.join(dir, 'nope'), 'ts')).rejects.toThrow();
    });
  });
});
