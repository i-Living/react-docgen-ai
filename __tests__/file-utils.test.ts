/**
 * @fileoverview Тесты для модуля file-utils
 * @author AI Docgen
 * @version 1.0.0
 */

import {
  getFiles,
  readFile,
  writeOutput,
  writeInPlace,
  hasFileoverview,
  removeComments,
  hasCodeChanges
} from '../src/file-utils.js';
import fs from 'fs-extra';
import path from 'path';
import { globby } from 'globby';

// Mock dependencies
jest.mock('globby');
jest.mock('fs-extra');
jest.mock('path');

describe('File Utils', () => {
  const testDir = path.join(process.cwd(), 'test-output');
  const testFile = path.join(testDir, 'test.txt');
  const testContent = 'Hello World';
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockGlobby = globby as jest.MockedFunction<typeof globby>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ isFile: jest.fn().mockReturnValue(false), isDirectory: jest.fn().mockReturnValue(true) } as any);
    mockFs.readFileSync.mockReturnValue(testContent);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.ensureDirSync.mockReturnValue(undefined);
    mockFs.mkdirSync.mockReturnValue(undefined);
  });

  describe('readFile', () => {
    beforeEach(() => {
      fs.writeFileSync(testFile, testContent);
    });

    afterEach(() => {
      if (fs.existsSync(testFile)) {
        fs.removeSync(testFile);
      }
    });

    it('should read file content correctly', () => {
      const result = readFile(testFile);
      expect(result).toBe(testContent);
    });

    it('should throw error when file does not exist', () => {
      expect(() => readFile('non-existent-file.txt')).toThrow();
    });
  });

  describe('writeOutput', () => {
    const baseOut = path.join(testDir, 'output');
    const srcFile = path.join(testDir, 'source.ts');
    const content = 'console.log("test");';

    beforeEach(() => {
      fs.writeFileSync(srcFile, content);
    });

    afterEach(() => {
      if (fs.existsSync(baseOut)) {
        fs.removeSync(baseOut);
      }
      if (fs.existsSync(srcFile)) {
        fs.removeSync(srcFile);
      }
    });

    it('should create output directory and write file', () => {
      const result = writeOutput(baseOut, srcFile, content);
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.readFileSync(result, 'utf8')).toBe(content);
    });

    it('should preserve directory structure', () => {
      const subDirFile = path.join(testDir, 'src', 'components', 'Test.tsx');
      fs.ensureDirSync(path.dirname(subDirFile));
      fs.writeFileSync(subDirFile, content);

      const result = writeOutput(baseOut, subDirFile, content);
      expect(result).toContain('src/components/Test.tsx');
      expect(fs.existsSync(result)).toBe(true);
    });
  });

  describe('writeInPlace', () => {
    const newContent = 'Modified content';

    beforeEach(() => {
      fs.writeFileSync(testFile, testContent);
    });

    afterEach(() => {
      if (fs.existsSync(testFile)) {
        fs.removeSync(testFile);
      }
    });

    it('should overwrite file content in place', () => {
      writeInPlace(testFile, newContent);
      const result = fs.readFileSync(testFile, 'utf8');
      expect(result).toBe(newContent);
    });
  });

  describe('hasFileoverview', () => {
    it('should return true for files with @fileoverview', () => {
      const contentWithOverview = `/**
 * @fileoverview Test component
 * @version 1.0.0
 */
export default function Test() {
  return <div>Test</div>;
}`;
      expect(hasFileoverview(contentWithOverview)).toBe(true);
    });

    it('should return false for files without @fileoverview', () => {
      const contentWithoutOverview = `export default function Test() {
  return <div>Test</div>;
}`;
      expect(hasFileoverview(contentWithoutOverview)).toBe(false);
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
      const code = `// This is a comment
const x = 5; // inline comment
/* Multi-line
   comment */
const y = 10;`;

      const result = removeComments(code);
      expect(result).toContain('const x = 5;');
      expect(result).toContain('const y = 10;');
      expect(result).not.toContain('// This is a comment');
      expect(result).not.toContain('inline comment');
    });

    it('should remove multi-line comments', () => {
      const code = `/* 
 * Block comment
 */
const x = 5;
/**
 * JSDoc comment
 */
const y = 10;`;

      const result = removeComments(code);
      expect(result).toContain('const x = 5;');
      expect(result).toContain('const y = 10;');
      expect(result).not.toContain('Block comment');
      expect(result).not.toContain('JSDoc comment');
    });

    it('should preserve string literals', () => {
      const code = `const str = "// This is not a comment";
const str2 = "/* This is not a comment */";
const str3 = \`// This is not a comment\`;

console.log(str);`;

      const result = removeComments(code);
      expect(result).toContain('// This is not a comment');
      expect(result).toContain('/* This is not a comment */');
    });

    it('should normalize whitespace', () => {
      const code = `   
const   x   =   5;   
    

const y = 10;  
`;

      const result = removeComments(code);
      expect(result).toContain('const x = 5;');
      expect(result).toContain('const y = 10;');
    });
  });

  describe('hasCodeChanges', () => {
    it('should return false when code is identical (ignoring comments)', () => {
      const original = `// Comment
const x = 5;
export default function Test() { return <div>Test</div>; }`;

      const modified = `/** Different comment */
const x = 5;
export default function Test() { return <div>Test</div>; }`;

      expect(hasCodeChanges(original, modified)).toBe(false);
    });

    it('should return true when code structure changed', () => {
      const original = `const x = 5;`;
      const modified = `const x = 10;`;

      expect(hasCodeChanges(original, modified)).toBe(true);
    });

    it('should return true when function signature changed', () => {
      const original = `function Test() { return <div>Test</div>; }`;
      const modified = `function Test() { return <div>Modified</div>; }`;

      expect(hasCodeChanges(original, modified)).toBe(true);
    });
  });

  describe('getFiles', () => {
    const testFilesDir = path.join(testDir, 'test-files');
    const testJsFile = path.join(testFilesDir, 'test.js');
    const testTsFile = path.join(testFilesDir, 'test.ts');
    const testTxtFile = path.join(testFilesDir, 'test.txt');

    beforeEach(() => {
      fs.ensureDirSync(testFilesDir);
      fs.writeFileSync(testJsFile, 'console.log("test");');
      fs.writeFileSync(testTsFile, 'const x: number = 5;');
      fs.writeFileSync(testTxtFile, 'This is not a source file');
      (globby as jest.Mock).mockClear();
    });

    afterEach(() => {
      if (fs.existsSync(testFilesDir)) {
        fs.removeSync(testFilesDir);
      }
    });

    it('should get files from directory with valid extensions', async () => {
      const mockFiles = [testJsFile, testTsFile];
      (globby as jest.Mock).mockResolvedValue(mockFiles);

      const files = await getFiles(testFilesDir, 'js,ts');
      
      expect(files).toHaveLength(2);
      expect(files).toContain(testJsFile);
      expect(files).toContain(testTsFile);
      expect(globby).toHaveBeenCalledWith([
        `${testFilesDir}/**/*.js`,
        `${testFilesDir}/**/*.ts`
      ]);
    });

    it('should handle single file with valid extension', async () => {
      const files = await getFiles(testJsFile, 'js');
      expect(files).toHaveLength(1);
      expect(files).toContain(testJsFile);
      expect(globby).not.toHaveBeenCalled();
    });

    it('should throw error for single file with invalid extension', async () => {
      await expect(getFiles(testTxtFile, 'js,ts')).rejects.toThrow();
    });

    it('should throw error for non-existent path', async () => {
      await expect(getFiles('non-existent-path', 'js')).rejects.toThrow();
    });
  });
});