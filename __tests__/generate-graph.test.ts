/**
 * @fileoverview Tests for generate-graph module
 * @author AI Docgen
 * @version 1.0.0
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Mutable mock objects for modules
// Use plain functions (not bun mocks) for mock.module compatibility
const mockFileUtils: Record<string, any> = {
  getFiles: mock(async () => [] as string[]),
  readFile: mock(() => ''),
};

const mockComponentGraph: Record<string, any> = {
  buildComponentGraph: mock(() => ({})),
  graphToDot: mock(() => ''),
  graphToMarkdown: mock(() => ''),
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
mock.module('../src/ast/component-graph.js', () => mockComponentGraph);

import { generateGraph } from '../src/generate-graph.js';

describe('Generate Graph', () => {
  beforeEach(() => {
    mockFileUtils.getFiles.mockClear();
    mockFileUtils.readFile.mockClear();
    mockComponentGraph.buildComponentGraph.mockClear();
    mockComponentGraph.graphToDot.mockClear();
    mockComponentGraph.graphToMarkdown.mockClear();
  });

  describe('generateGraph', () => {
    const mockOptions = {
      src: './test-src',
      out: './test-out',
      annotate: false,
      docs: false,
      graph: true,
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

    it('should generate graph for single component', async () => {
      const testFiles = ['src/App.tsx'];
      const appCode = `function App() { return <div><Header /></div>; }`;
      const componentGraph = { App: { file: 'src/App.tsx', children: ['Header'] } };

      mockFileUtils.getFiles.mockImplementation(async () => testFiles);
      mockFileUtils.readFile.mockImplementation(() => appCode);
      mockComponentGraph.buildComponentGraph.mockImplementation(() => componentGraph);
      mockComponentGraph.graphToDot.mockImplementation(() => 'digraph {}');
      mockComponentGraph.graphToMarkdown.mockImplementation(() => '# tree');

      // Silence console.log output
      const origLog = console.log;
      console.log = () => {};

      await generateGraph(mockOptions);

      console.log = origLog;

      expect(mockFileUtils.getFiles).toHaveBeenCalledWith('./test-src', 'ts,tsx');
      expect(mockFileUtils.readFile).toHaveBeenCalledWith('src/App.tsx');
      expect(mockComponentGraph.buildComponentGraph).toHaveBeenCalledWith([
        { path: 'src/App.tsx', content: appCode }
      ]);
      expect(mockComponentGraph.graphToDot).toHaveBeenCalledWith(componentGraph);
      expect(mockComponentGraph.graphToMarkdown).toHaveBeenCalledWith(componentGraph);
    });

    it('should generate graph for multiple components', async () => {
      const testFiles = ['src/App.tsx', 'src/Header.tsx'];
      const componentGraph = { App: { file: 'src/App.tsx', children: ['Header'] } };

      mockFileUtils.getFiles.mockImplementation(async () => testFiles);
      mockFileUtils.readFile.mockImplementation(() => 'function Cmp() { return null; }');
      mockComponentGraph.buildComponentGraph.mockImplementation(() => componentGraph);
      mockComponentGraph.graphToDot.mockImplementation(() => 'digraph {}');
      mockComponentGraph.graphToMarkdown.mockImplementation(() => '# tree');

      const origLog = console.log;
      console.log = () => {};

      await generateGraph(mockOptions);

      console.log = origLog;

      expect(mockFileUtils.getFiles).toHaveBeenCalledWith('./test-src', 'ts,tsx');
      expect(mockFileUtils.readFile).toHaveBeenCalledTimes(testFiles.length);
      expect(mockComponentGraph.buildComponentGraph).toHaveBeenCalledOnce();
    });
  });
});
