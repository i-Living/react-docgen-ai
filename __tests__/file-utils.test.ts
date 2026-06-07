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
import fs from 'fs';
import path from 'path';

// Mock dependencies

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  statSync: jest.fn().mockReturnValue({ isFile: () => true, isDirectory: () => false }),
  readFileSync: jest.fn().mockReturnValue(''),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
  cpSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue([]),
}));

describe('File Utils', () => {
  const testDir = path.join(process.cwd(), 'test-output');
  const testFile = path.join(testDir, 'test.txt');
  const testContent = 'Hello World';
  const mockFs = fs as jest.Mocked<typeof fs>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ isFile: () => false, isDirectory: () => true } as any);
    mockFs.readFileSync.mockReturnValue(testContent);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.mkdirSync.mockReturnValue(undefined);
  });

  describe('readFile', () => {
    beforeEach(() => {
      fs.writeFileSync(testFile, testContent);
    });

    afterEach(() => {
      if (fs.existsSync(testFile)) {
        fs.rmSync(testFile);
      }
    });

    it('should read file content correctly', () => {
      const result = readFile(testFile);
      expect(result).toBe(testContent);
    });

    it('should throw error when file does not exist', () => {
      mockFs.existsSync.mockReturnValueOnce(false);
      mockFs.readFileSync.mockImplementationOnce(() => { throw new Error('ENOENT: no such file or directory'); });
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
        fs.rmSync(baseOut);
      }
      if (fs.existsSync(srcFile)) {
        fs.rmSync(srcFile);
      }
    });

    it('should create output directory and write file', () => {
      const result = writeOutput(baseOut, srcFile, content);
      expect(fs.existsSync(result)).toBe(true);
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should preserve directory structure', () => {
      const subDirFile = path.join(testDir, 'src', 'components', 'Test.tsx');

      const result = writeOutput(baseOut, subDirFile, content);
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('writeInPlace', () => {
    const newContent = 'Modified content';

    beforeEach(() => {
      fs.writeFileSync(testFile, testContent);
    });

    afterEach(() => {
      if (fs.existsSync(testFile)) {
        fs.rmSync(testFile);
      }
    });

    it('should overwrite file content in place', () => {
      writeInPlace(testFile, newContent);
      expect(fs.writeFileSync).toHaveBeenCalledWith(testFile, newContent, "utf8");
    });
  });

  describe('hasFileoverview', () => {
    const realHasFileoverview = jest.requireActual('../src/file-utils.js').hasFileoverview;
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
    const realRemoveComments = jest.requireActual('../src/file-utils.js').removeComments;
    it('should remove single-line comments', () => {
      const code = `// This is a comment
const x = 5; // inline comment
/* Multi-line
   comment */
const y = 10;`;

      const result = realRemoveComments(code);
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

      const result = realRemoveComments(code);
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

      const result = realRemoveComments(code);
      expect(result).toContain('// This is not a comment');
      expect(result).toContain('/* This is not a comment */');
    });

    it('should normalize whitespace', () => {
      const code = `   
const   x   =   5;   
    

const y = 10;  
`;

      const result = realRemoveComments(code);
      expect(result).toContain('const x = 5;');
      expect(result).toContain('const y = 10;');
    });
  });

  describe('hasCodeChanges', () => {
    const realHasCodeChanges = jest.requireActual('../src/file-utils.js').hasCodeChanges;
    const realRemoveComments = jest.requireActual('../src/file-utils.js').removeComments;
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
    // Use real implementation for getFiles (not mocked)
    const realGetFiles = jest.requireActual('../src/file-utils.js').getFiles;
    const testFilesDir = path.join(testDir, 'test-files');
    const testJsFile = path.join(testFilesDir, 'test.js');
    const testTsFile = path.join(testFilesDir, 'test.ts');
    const testTxtFile = path.join(testFilesDir, 'test.txt');

    beforeEach(() => {
      // Настраиваем моки fs для имитации файловой структуры
      const testDirEntries = [
        { name: 'test.js', isFile: () => true, isDirectory: () => false },
        { name: 'test.ts', isFile: () => true, isDirectory: () => false },
        { name: 'test.txt', isFile: () => true, isDirectory: () => false },
      ];
      const testDirName = path.basename(testFilesDir);
      const parentDir = path.dirname(testFilesDir);
      mockFs.readdirSync.mockImplementation((dir: string) => {
        if (dir === testFilesDir) return testDirEntries as any;
        if (dir === parentDir) return [{ name: testDirName, isFile: () => false, isDirectory: () => true }] as any;
        return [];
      });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockImplementation((p: string) => {
        if (p === testFilesDir) return { isFile: () => false, isDirectory: () => true } as any;
        if (p === testJsFile || p === testTsFile || p === testTxtFile) return { isFile: () => true, isDirectory: () => false } as any;
        return { isFile: () => true, isDirectory: () => false } as any;
      });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should get files from directory with valid extensions', async () => {
      const files = await realGetFiles(testFilesDir, 'js,ts');
      
      expect(files).toHaveLength(2);
      expect(files).toContain(testJsFile);
      expect(files).toContain(testTsFile);
    });

    it('should handle single file with valid extension', async () => {
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as any);
      const files = await realGetFiles(testJsFile, 'js');
      expect(files).toHaveLength(1);
      expect(files).toContain(testJsFile);
    });

    it('should throw error for single file with invalid extension', async () => {
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as any);
      await expect(realGetFiles(testTxtFile, 'js,ts')).rejects.toThrow();
    });

    it('should throw error for non-existent path', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.statSync.mockReturnValue({ isFile: () => true, isDirectory: () => false } as any);
      await expect(realGetFiles('non-existent-path', 'js')).rejects.toThrow();
    });
  });
});