/**
 * @fileoverview Тесты для модуля docgen
 * @author AI Docgen
 * @version 1.0.0
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Mutable mock objects
const mockFileUtils: Record<string, any> = {
  getFiles: mock(async () => []),
  readFile: mock(() => ''),
  writeOutput: mock(() => ''),
  outputFileExists: mock(() => false),
  getDocFiles: mock(async () => []),
  deleteFile: mock(() => undefined),
  readOutputFile: mock(() => null),
  extractDocHash: mock(() => null),
  hashContent: mock(() => ''),
};

const mockLlmClient: Record<string, any> = {
  callLLM: mock(async () => ''),
};

const mockAstExtractor: Record<string, any> = {
  extractComponentInfo: mock(() => ({
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
  })),
};

const mockPromptLoader: Record<string, any> = {
  getDocumentationPrompt: mock(() => ''),
  setPromptDirectory: mock(() => undefined),
};

const mockFs: Record<string, any> = {
  existsSync: () => true,
  statSync: () => ({ isFile: () => true, isDirectory: () => false }),
  readFileSync: () => '',
  writeFileSync: () => undefined,
  mkdirSync: () => undefined,
  rmSync: () => undefined,
  cpSync: () => undefined,
  readdirSync: () => [],
};

mock.module('../src/file-utils.js', () => mockFileUtils);
mock.module('../src/llm-client.js', () => mockLlmClient);
mock.module('../src/ast/ast-extractor.js', () => mockAstExtractor);
mock.module('../src/prompt-loader.js', () => mockPromptLoader);

import { generateDocs } from '../src/docgen.js';

describe('Docgen', () => {
  beforeEach(() => {
    mockFileUtils.getFiles.mockClear();
    mockFileUtils.readFile.mockClear();
    mockFileUtils.writeOutput.mockClear();
    mockFileUtils.outputFileExists.mockClear();
    mockFileUtils.getDocFiles.mockClear();
    mockLlmClient.callLLM.mockClear();
    mockAstExtractor.extractComponentInfo.mockClear();
    mockPromptLoader.getDocumentationPrompt.mockClear();
    // Default setup
    mockFileUtils.getDocFiles.mockImplementation(async () => []);
    mockFileUtils.outputFileExists.mockImplementation(() => false);
    // Default callLLM возвращает валидную документацию (с # и длиннее 50 символов)
    mockLlmClient.callLLM.mockImplementation(async () => '# Component\n\nValid documentation with enough length for validation test.');
  });

  describe('generateDocs', () => {
    const mockOptions = {
      src: './test-src',
      out: './test-out',
      annotate: false,
      docs: true,
      graph: false,
      extensions: 'ts,tsx',
      api: 'http://localhost:8000/completions',
      force: false,
      opencode: false,
      opencodeModel: '',
      parallel: 4,
      dryRun: false,
      format: 'markdown' as const,
      stream: false,
    };

    it('should generate documentation for single component', async () => {
      const testFiles = ['src/Button.tsx'];
      const buttonCode = `function Button({ text, onClick }: any) { return <button onClick={onClick}>{text}</button>; }`;
      const componentInfo = {
        name: 'Button', props: [], state: [], effects: [],
        handlers: [], jsxTree: ['button'], exportsComponent: true,
        fileType: 'component', hasContext: false, hasStore: false,
      };

      mockFileUtils.getFiles.mockImplementation(async () => testFiles);
      mockFileUtils.readFile.mockImplementation(() => buttonCode);
      mockAstExtractor.extractComponentInfo.mockImplementation(() => componentInfo);
      mockPromptLoader.getDocumentationPrompt.mockImplementation(() => 'Generate docs for Button');
      mockLlmClient.callLLM.mockImplementation(async () => '# Button Component\n\nA button component.');

      // Silence console
      const origLog = console.log;
      console.log = () => {};
      await generateDocs(mockOptions);
      console.log = origLog;

      expect(mockFileUtils.getFiles).toHaveBeenCalledWith('./test-src', 'ts,tsx');
      expect(mockFileUtils.readFile).toHaveBeenCalledWith('src/Button.tsx');
      expect(mockAstExtractor.extractComponentInfo).toHaveBeenCalledWith(buttonCode);
    });

    it('should generate documentation for multiple components', async () => {
      const testFiles = ['src/Button.tsx', 'src/Header.tsx', 'src/Footer.tsx'];
      
      mockFileUtils.getFiles.mockImplementation(async () => testFiles);
      mockFileUtils.readFile.mockImplementation((file: string) => {
        const codeMap: Record<string, string> = {
          'src/Button.tsx': 'function Button() { return <button/>; } export default Button;',
          'src/Header.tsx': 'function Header() { return <h1/>; } export default Header;',
          'src/Footer.tsx': 'function Footer() { return <footer/>; } export default Footer;',
        };
        return codeMap[file] ?? '';
      });
      mockAstExtractor.extractComponentInfo.mockImplementation((code: string) => ({
        name: code.includes('Button') ? 'Button' : code.includes('Header') ? 'Header' : 'Footer',
        props: [], state: [], effects: [], handlers: [],
        jsxTree: ['div'], exportsComponent: true,
        fileType: 'component' as const, hasContext: false, hasStore: false,
      }));
      mockPromptLoader.getDocumentationPrompt.mockImplementation(() => 'Prompt');
      mockLlmClient.callLLM.mockImplementation(async () => '# Component\n\nValid documentation with enough length for validation test.');

      const origLog = console.log;
      console.log = () => {};
      await generateDocs(mockOptions);
      console.log = origLog;

      expect(mockFileUtils.getFiles).toHaveBeenCalledWith('./test-src', 'ts,tsx');
      expect(mockFileUtils.readFile).toHaveBeenCalledTimes(3);
      expect(mockAstExtractor.extractComponentInfo).toHaveBeenCalledTimes(3);
      expect(mockLlmClient.callLLM).toHaveBeenCalledTimes(3);
    });

    it('should handle file without default export', async () => {
      const testFiles = ['src/utils.ts'];
      const utilsCode = 'export function helper() { return "help"; }';
      const componentInfo = {
        name: null, props: [], state: [], effects: [], handlers: [],
        jsxTree: [], exportsComponent: false,
        fileType: 'util' as const, hasContext: false, hasStore: false,
      };

      mockFileUtils.getFiles.mockImplementation(async () => testFiles);
      mockFileUtils.readFile.mockImplementation(() => utilsCode);
      mockAstExtractor.extractComponentInfo.mockImplementation(() => componentInfo);
      mockPromptLoader.getDocumentationPrompt.mockImplementation(() => 'Generate docs');

      const origLog = console.log;
      console.log = () => {};
      await generateDocs(mockOptions);
      console.log = origLog;

      expect(mockPromptLoader.getDocumentationPrompt).toHaveBeenCalledWith(componentInfo, utilsCode);
      expect(mockLlmClient.callLLM).toHaveBeenCalledTimes(1);
    });

    it('should create markdown files in output directory', async () => {
      const testFiles = ['src/components/Button.tsx'];
      const buttonCode = 'function Button() { return <button>Click</button>; } export default Button;';

      mockFileUtils.getFiles.mockImplementation(async () => testFiles);
      mockFileUtils.readFile.mockImplementation(() => buttonCode);
      mockAstExtractor.extractComponentInfo.mockImplementation(() => ({
        name: 'Button', props: [], state: [], effects: [], handlers: [],
        jsxTree: ['button'], exportsComponent: true,
        fileType: 'component' as const, hasContext: false, hasStore: false,
      }));
      mockPromptLoader.getDocumentationPrompt.mockImplementation(() => 'Prompt');
      mockLlmClient.callLLM.mockImplementation(async () => '# Button Component');

      const origLog = console.log;
      console.log = () => {};
      await generateDocs(mockOptions);
      console.log = origLog;

      expect(mockFileUtils.writeOutput).toHaveBeenCalledWith(
        expect.stringContaining('test-out'),
        expect.any(String),
        expect.stringContaining('# Button Component'),
      );
    });

    it('should handle errors gracefully', async () => {
      mockFileUtils.getFiles.mockImplementation(async () => ['src/Button.tsx']);
      mockFileUtils.readFile.mockImplementation(() => 'function B() { return null; }');
      mockAstExtractor.extractComponentInfo.mockImplementation(() => ({
        name: 'Button', props: [], state: [], effects: [], handlers: [],
        jsxTree: ['button'], exportsComponent: true,
        fileType: 'component' as const, hasContext: false, hasStore: false,
      }));
      mockPromptLoader.getDocumentationPrompt.mockImplementation(() => 'Prompt');
      mockLlmClient.callLLM.mockImplementation(async () => { throw new Error('LLM API Error'); });
      mockFileUtils.outputFileExists.mockImplementation(() => false);

      const origLog = console.log;
      console.log = () => {};
      // Ошибка обрабатывается внутри пайплайна — функция не выбрасывает
      await generateDocs(mockOptions);
      console.log = origLog;

      expect(mockLlmClient.callLLM).toHaveBeenCalled();
    });

    it('should handle empty directory', async () => {
      mockFileUtils.getFiles.mockImplementation(async () => []);

      const origLog = console.log;
      console.log = () => {};
      await generateDocs(mockOptions);
      console.log = origLog;

      expect(mockFileUtils.readFile).not.toHaveBeenCalled();
      expect(mockAstExtractor.extractComponentInfo).not.toHaveBeenCalled();
      expect(mockLlmClient.callLLM).not.toHaveBeenCalled();
    });

    it('should log progress information', async () => {
      mockFileUtils.getFiles.mockImplementation(async () => ['src/Component.tsx']);
      mockFileUtils.readFile.mockImplementation(() => 'function C() { return null; }');
      mockAstExtractor.extractComponentInfo.mockImplementation(() => ({
        name: 'C', props: [], state: [], effects: [], handlers: [],
        jsxTree: ['div'], exportsComponent: true,
        fileType: 'component' as const, hasContext: false, hasStore: false,
      }));
      mockPromptLoader.getDocumentationPrompt.mockImplementation(() => 'Prompt');
      mockLlmClient.callLLM.mockImplementation(async () => '# Doc');

      // Capture console output
      const captured: string[] = [];
      const origLog = console.log;
      console.log = (...args: any[]) => { captured.push(args.join(' ')); };

      await generateDocs(mockOptions);

      console.log = origLog;

      expect(captured.some((s) => s.includes('Docgen (markdown)'))).toBe(true);
      expect(captured.some((s) => s.includes('completed'))).toBe(true);
    });
  });
});
