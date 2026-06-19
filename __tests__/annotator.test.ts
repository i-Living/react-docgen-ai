/**
 * @fileoverview Тесты для модуля annotator
 * @author AI Docgen
 * @version 1.0.0
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Mutable mock objects
const mockFileUtils: Record<string, any> = {
  getFiles: mock(async () => []),
  readFile: mock(() => ''),
  writeOutput: mock(() => ''),
  writeInPlace: mock(() => undefined),
  hasFileoverview: mock(() => false),
  hasCodeChanges: mock(() => false),
};

// annotator.ts imports callLlm from ./llm.js (not llm-client.js)
const mockLlm: Record<string, any> = {
  callLlm: mock(async () => ''),
  disposeLlm: mock(() => undefined),
};

const mockAstExtractor: Record<string, any> = {
  extractComponentInfo: mock(() => ({
    name: null, props: [], state: [], effects: [],
    handlers: [], jsxTree: [], exportsComponent: false,
    fileType: 'skip', hasContext: false, hasStore: false,
  })),
};

const mockPromptLoader: Record<string, any> = {
  getAnnotationPrompt: mock(() => ''),
  setPromptDirectory: mock(() => undefined),
};

const mockCompactFormat: Record<string, any> = {
  toCompactAst: mock(() => ''),
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
mock.module('../src/llm.js', () => mockLlm);  // not llm-client.js!
mock.module('../src/ast/ast-extractor.js', () => mockAstExtractor);
mock.module('../src/prompt-loader.js', () => mockPromptLoader);
mock.module('../src/ast/compact-format.js', () => mockCompactFormat);

import { annotateProject, annotateInPlace } from '../src/annotator.js';

describe('Annotator', () => {
  const mockOptions: any = {
    src: './test-src',
    out: './test-out',
    annotate: true,
    docs: false,
    graph: false,
    extensions: 'ts,tsx',
    api: 'http://localhost:8000/completions',
    force: false,
    opencode: false,
    opencodeModel: '',
    parallel: 4,
    dryRun: false,
    format: 'markdown',
    stream: false,
  };

  const originalCode = `function Button({ text, onClick }) {
  return <button onClick={onClick}>{text}</button>;
}
export default Button;`;

  const annotatedCode = `/**
 * @fileoverview Компонент кнопки
 */
function Button({ text, onClick }) {
  return <button onClick={onClick}>{text}</button>;
}
export default Button;`;

  beforeEach(() => {
    // Clear all mocks
    mockFileUtils.getFiles.mockClear();
    mockFileUtils.readFile.mockClear();
    mockFileUtils.writeOutput.mockClear();
    mockFileUtils.writeInPlace.mockClear();
    mockFileUtils.hasFileoverview.mockClear();
    mockFileUtils.hasCodeChanges.mockClear();
    mockLlm.callLlm.mockClear();
    mockAstExtractor.extractComponentInfo.mockClear();
    mockPromptLoader.getAnnotationPrompt.mockClear();
  });

  function setupSuccess() {
    mockFileUtils.getFiles.mockImplementation(async (src: string, ext: string) => ['src/Button.tsx']);
    mockFileUtils.readFile.mockImplementation(() => originalCode);
    mockFileUtils.hasFileoverview.mockImplementation(() => false);
    mockAstExtractor.extractComponentInfo.mockImplementation(() => ({
      name: 'Button', props: [], state: [], effects: [],
      handlers: [], jsxTree: [], exportsComponent: true,
      fileType: 'component', hasContext: false, hasStore: false,
    }));
    mockPromptLoader.getAnnotationPrompt.mockImplementation(() => 'Annotate this code');
    mockLlm.callLlm.mockImplementation(async () => annotatedCode);
    mockFileUtils.hasCodeChanges.mockImplementation(() => false);
    mockFileUtils.writeOutput.mockImplementation(() => 'output.tsx');
  }

  describe('annotateProject', () => {
    it('should annotate single component successfully', async () => {
      setupSuccess();

      const origLog = console.log;
      console.log = () => {};
      await annotateProject(mockOptions);
      console.log = origLog;

      expect(mockFileUtils.getFiles).toHaveBeenCalledWith('./test-src', 'ts,tsx');
      expect(mockFileUtils.readFile).toHaveBeenCalledWith('src/Button.tsx');
      expect(mockFileUtils.hasFileoverview).toHaveBeenCalledWith(originalCode);
      expect(mockAstExtractor.extractComponentInfo).toHaveBeenCalledWith(originalCode);
      expect(mockLlm.callLlm).toHaveBeenCalledWith(
        mockOptions,
        'Annotate this code'
      );
      expect(mockFileUtils.hasCodeChanges).toHaveBeenCalledWith(originalCode, annotatedCode);
      expect(mockFileUtils.writeOutput).toHaveBeenCalledWith(
        './test-out/annotated', 'src/Button.tsx', annotatedCode
      );
    });

    it('should skip files with @fileoverview when force is false', async () => {
      mockFileUtils.getFiles.mockImplementation(async () => ['src/AlreadyAnnotated.tsx']);
      mockFileUtils.readFile.mockImplementation(() => '// @fileoverview\n' + originalCode);
      mockFileUtils.hasFileoverview.mockImplementation(() => true);

      const origLog = console.log;
      console.log = () => {};
      await annotateProject(mockOptions);
      console.log = origLog;

      expect(mockAstExtractor.extractComponentInfo).not.toHaveBeenCalled();
      expect(mockLlm.callLlm).not.toHaveBeenCalled();
      expect(mockFileUtils.writeOutput).not.toHaveBeenCalled();
    });

    it('should process files with @fileoverview when force is true', async () => {
      const forceOptions = { ...mockOptions, force: true };
      mockFileUtils.getFiles.mockImplementation(async () => ['src/AlreadyAnnotated.tsx']);
      mockFileUtils.readFile.mockImplementation(() => '// @fileoverview\n' + originalCode);
      mockFileUtils.hasFileoverview.mockImplementation(() => true);
      mockAstExtractor.extractComponentInfo.mockImplementation(() => ({
        name: 'AlreadyAnnotated', props: [], state: [], effects: [],
        handlers: [], jsxTree: [], exportsComponent: true,
        fileType: 'component', hasContext: false, hasStore: false,
      }));
      mockPromptLoader.getAnnotationPrompt.mockImplementation(() => 'Annotate');
      mockLlm.callLlm.mockImplementation(async () => annotatedCode);
      mockFileUtils.hasCodeChanges.mockImplementation(() => false);
      mockFileUtils.writeOutput.mockImplementation(() => 'output.tsx');

      const origLog = console.log;
      console.log = () => {};
      await annotateProject(forceOptions);
      console.log = origLog;

      expect(mockAstExtractor.extractComponentInfo).toHaveBeenCalled();
      expect(mockLlm.callLlm).toHaveBeenCalled();
      expect(mockFileUtils.writeOutput).toHaveBeenCalled();
    });

    it('should retry annotation when code changes detected', async () => {
      mockFileUtils.getFiles.mockImplementation(async () => ['src/Button.tsx']);
      mockFileUtils.readFile.mockImplementation(() => originalCode);
      mockFileUtils.hasFileoverview.mockImplementation(() => false);
      mockAstExtractor.extractComponentInfo.mockImplementation(() => ({
        name: 'Button', props: [], state: [], effects: [],
        handlers: [], jsxTree: [], exportsComponent: true,
        fileType: 'component', hasContext: false, hasStore: false,
      }));
      mockPromptLoader.getAnnotationPrompt.mockImplementation(() => 'Annotate');
      
      // First call returns changed code, second call returns valid
      let callLLMCalls = 0;
      mockLlm.callLlm.mockImplementation(async () => {
        callLLMCalls++;
        if (callLLMCalls === 1) return '// Modified function Button() { return <div>Changed</div>; }';
        return annotatedCode;
      });
      
      let codeChangeCalls = 0;
      mockFileUtils.hasCodeChanges.mockImplementation(() => {
        codeChangeCalls++;
        return codeChangeCalls === 1; // first call = true (changed), second = false
      });
      
      mockFileUtils.writeOutput.mockImplementation(() => 'output.tsx');

      const origLog = console.log;
      console.log = () => {};
      await annotateProject(mockOptions);
      console.log = origLog;

      expect(mockLlm.callLlm).toHaveBeenCalledTimes(2);
      expect(mockFileUtils.hasCodeChanges).toHaveBeenCalledTimes(2);
      expect(mockFileUtils.writeOutput).toHaveBeenCalledTimes(1);
    });

    it('should skip file after max retry attempts', async () => {
      mockFileUtils.getFiles.mockImplementation(async () => ['src/Problematic.tsx']);
      mockFileUtils.readFile.mockImplementation(() => 'function Problematic() { return <div>Problem</div>; }');
      mockFileUtils.hasFileoverview.mockImplementation(() => false);
      mockAstExtractor.extractComponentInfo.mockImplementation(() => ({
        name: 'Problematic', props: [], state: [], effects: [],
        handlers: [], jsxTree: [], exportsComponent: true,
        fileType: 'component', hasContext: false, hasStore: false,
      }));
      mockPromptLoader.getAnnotationPrompt.mockImplementation(() => 'Annotate');
      mockLlm.callLlm.mockImplementation(async () => '// Always changed');
      mockFileUtils.hasCodeChanges.mockImplementation(() => true);

      const origLog = console.log;
      console.log = () => {};
      await annotateProject(mockOptions);
      console.log = origLog;

      // Should attempt 3 times (was 5 before refactoring)
      expect(mockLlm.callLlm).toHaveBeenCalledTimes(3);
      expect(mockFileUtils.hasCodeChanges).toHaveBeenCalledTimes(3);
      expect(mockFileUtils.writeOutput).not.toHaveBeenCalled();
    });

    it('should skip file on LLM error after max attempts', async () => {
      mockFileUtils.getFiles.mockImplementation(async () => ['src/ErrorFile.tsx']);
      mockFileUtils.readFile.mockImplementation(() => 'function Error() { return <div>Error</div>; }');
      mockFileUtils.hasFileoverview.mockImplementation(() => false);
      mockAstExtractor.extractComponentInfo.mockImplementation(() => ({
        name: 'ErrorFile', props: [], state: [], effects: [],
        handlers: [], jsxTree: [], exportsComponent: true,
        fileType: 'component', hasContext: false, hasStore: false,
      }));
      mockPromptLoader.getAnnotationPrompt.mockImplementation(() => 'Annotate');
      mockLlm.callLlm.mockImplementation(async () => { throw new Error('LLM API Error'); });

      const origLog = console.log;
      console.log = () => {};
      await annotateProject(mockOptions);
      console.log = origLog;

      expect(mockLlm.callLlm).toHaveBeenCalledTimes(3);
      expect(mockFileUtils.writeOutput).not.toHaveBeenCalled();
    });

    it('should handle multiple files correctly', async () => {
      mockFileUtils.getFiles.mockImplementation(async () => ['src/Button.tsx', 'src/Header.tsx', 'src/Footer.tsx']);
      mockFileUtils.readFile.mockImplementation(() => originalCode);
      mockFileUtils.hasFileoverview.mockImplementation(() => false);
      mockAstExtractor.extractComponentInfo.mockImplementation(() => ({
        name: 'Component', props: [], state: [], effects: [],
        handlers: [], jsxTree: [], exportsComponent: true,
        fileType: 'component', hasContext: false, hasStore: false,
      }));
      mockPromptLoader.getAnnotationPrompt.mockImplementation(() => 'Annotate');
      mockLlm.callLlm.mockImplementation(async () => annotatedCode);
      mockFileUtils.hasCodeChanges.mockImplementation(() => false);
      mockFileUtils.writeOutput.mockImplementation(() => 'output.tsx');

      const origLog = console.log;
      console.log = () => {};
      await annotateProject(mockOptions);
      console.log = origLog;

      expect(mockLlm.callLlm).toHaveBeenCalledTimes(3);
      expect(mockFileUtils.writeOutput).toHaveBeenCalledTimes(3);
    });
  });

  describe('annotateInPlace', () => {
    const inPlaceCode = `function Button({ text }) {
  return <button>{text}</button>;
}
export default Button;`;

    const inPlaceAnnotated = `/**
 * @fileoverview Кнопка компонент
 */
function Button({ text }) {
  return <button>{text}</button>;
}
export default Button;`;

    it('should annotate file in place successfully', async () => {
      mockFileUtils.getFiles.mockImplementation(async () => ['src/Button.tsx']);
      mockFileUtils.readFile.mockImplementation(() => inPlaceCode);
      mockFileUtils.hasFileoverview.mockImplementation(() => false);
      mockAstExtractor.extractComponentInfo.mockImplementation(() => ({
        name: 'Button', props: [], state: [], effects: [],
        handlers: [], jsxTree: [], exportsComponent: true,
        fileType: 'component', hasContext: false, hasStore: false,
      }));
      mockPromptLoader.getAnnotationPrompt.mockImplementation(() => 'Annotate');
      mockLlm.callLlm.mockImplementation(async () => inPlaceAnnotated);
      mockFileUtils.hasCodeChanges.mockImplementation(() => false);

      const origLog = console.log;
      console.log = () => {};
      await annotateInPlace({
        ...mockOptions, annotateInplace: true, annotate: false,
      });
      console.log = origLog;

      expect(mockFileUtils.writeInPlace).toHaveBeenCalledWith('src/Button.tsx', inPlaceAnnotated);
      expect(mockFileUtils.writeOutput).not.toHaveBeenCalled();
    });

    it('should handle retry logic in place annotation', async () => {
      mockFileUtils.getFiles.mockImplementation(async () => ['src/RetryComponent.tsx']);
      mockFileUtils.readFile.mockImplementation(() => inPlaceCode);
      mockFileUtils.hasFileoverview.mockImplementation(() => false);
      mockAstExtractor.extractComponentInfo.mockImplementation(() => ({
        name: 'RetryComponent', props: [], state: [], effects: [],
        handlers: [], jsxTree: [], exportsComponent: true,
        fileType: 'component', hasContext: false, hasStore: false,
      }));
      mockPromptLoader.getAnnotationPrompt.mockImplementation(() => 'Annotate');
      
      let retryCalls = 0;
      mockLlm.callLlm.mockImplementation(async () => {
        retryCalls++;
        if (retryCalls === 1) throw new Error('LLM Error');
        return inPlaceAnnotated;
      });
      mockFileUtils.hasCodeChanges.mockImplementation(() => false);

      const origLog = console.log;
      console.log = () => {};
      await annotateInPlace({
        ...mockOptions, annotateInplace: true, annotate: false,
      });
      console.log = origLog;

      expect(mockLlm.callLlm).toHaveBeenCalledTimes(2);
      expect(mockFileUtils.writeInPlace).toHaveBeenCalledTimes(1);
    });

    it('should skip files with @fileoverview', async () => {
      mockFileUtils.getFiles.mockImplementation(async () => ['src/Annotated.tsx']);
      mockFileUtils.readFile.mockImplementation(() => '// @fileoverview\n' + inPlaceCode);
      mockFileUtils.hasFileoverview.mockImplementation(() => true);

      const origLog = console.log;
      console.log = () => {};
      await annotateInPlace({
        ...mockOptions, annotateInplace: true, annotate: false,
      });
      console.log = origLog;

      expect(mockAstExtractor.extractComponentInfo).not.toHaveBeenCalled();
      expect(mockLlm.callLlm).not.toHaveBeenCalled();
      expect(mockFileUtils.writeInPlace).not.toHaveBeenCalled();
    });
  });
});
