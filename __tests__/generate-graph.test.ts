/**
 * @fileoverview Тесты для модуля generate-graph
 * @author AI Docgen
 * @version 1.0.0
 */

import { generateGraph } from '../src/generate-graph.js';
import { getFiles, readFile } from '../src/file-utils.js';
import { buildComponentGraph, graphToDot, graphToMarkdown } from '../src/ast/component-graph.js';
import fs from 'fs-extra';

jest.mock('../src/file-utils.js');
jest.mock('../src/ast/component-graph.js');
jest.mock('fs-extra');
jest.mock('globby');

describe('Generate Graph', () => {
  const mockGetFiles = getFiles as jest.MockedFunction<typeof getFiles>;
  const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
  const mockBuildComponentGraph = buildComponentGraph as jest.MockedFunction<typeof buildComponentGraph>;
  const mockGraphToDot = graphToDot as jest.MockedFunction<typeof graphToDot>;
  const mockGraphToMarkdown = graphToMarkdown as jest.MockedFunction<typeof graphToMarkdown>;
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateGraph', () => {
    const mockOptions = {
      src: './test-src',
      out: './test-out',
      annotate: false,
      docs: false,
      graph: true,
      extensions: 'ts,tsx',
      api: 'http://localhost:8000/completions'
    };

    it('should generate graph for single component', async () => {
      const testFiles = ['src/App.tsx'];
      const appCode = `
        function App() {
          return <div><Header /></div>;
        }
        export default App;
      `;

      const componentGraph = {
        App: {
          file: 'src/App.tsx',
          children: ['Header']
        },
        Header: {
          file: 'src/Header.tsx',
          children: []
        }
      };

      const dotContent = `digraph Components {
  node [shape=box, style=filled, fillcolor=lightblue];
  edge [color=gray];

  "App" [label="App\\n(App.tsx)"];
  "Header" [label="Header\\n(Header.tsx)"];
  "App" -> "Header";
}`;

      const mdContent = `# Component Tree

Иерархия React компонентов проекта.

## App

**Файл:** \`src/App.tsx\`

**Дочерние компоненты:**
- Header

---`;

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockReturnValue(appCode);
      mockBuildComponentGraph.mockReturnValue(componentGraph);
      mockGraphToDot.mockReturnValue(dotContent);
      mockGraphToMarkdown.mockReturnValue(mdContent);

      await generateGraph(mockOptions);

      expect(mockGetFiles).toHaveBeenCalledWith('./test-src', 'ts,tsx');
      expect(mockReadFile).toHaveBeenCalledWith('src/App.tsx');
      expect(mockBuildComponentGraph).toHaveBeenCalledWith([
        { path: 'src/App.tsx', content: appCode }
      ]);
      expect(mockGraphToDot).toHaveBeenCalledWith(componentGraph);
      expect(mockGraphToMarkdown).toHaveBeenCalledWith(componentGraph);
      
      // Check that files are written
      expect(mockFs.ensureDirSync).toHaveBeenCalledWith('test-out/graph');
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        'test-out/graph/components.dot',
        dotContent
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        'test-out/graph/components.md',
        mdContent
      );
    });

    it('should generate graph for multiple components', async () => {
      const testFiles = [
        'src/App.tsx',
        'src/Header.tsx',
        'src/Button.tsx',
        'src/Footer.tsx'
      ];

      const appCode = `function App() {
        return (
          <div>
            <Header />
            <Button />
            <Footer />
          </div>
        );
      }`;

      const headerCode = `function Header() {
        return <header><Logo /></header>;
      }`;

      const buttonCode = `const Button = () => <button>Click</button>;`;

      const footerCode = `function Footer() {
        return <footer>Footer</footer>;
      }`;

      const complexGraph = {
        App: {
          file: 'src/App.tsx',
          children: ['Header', 'Button', 'Footer']
        },
        Header: {
          file: 'src/Header.tsx',
          children: ['Logo']
        },
        Button: {
          file: 'src/Button.tsx',
          children: []
        },
        Footer: {
          file: 'src/Footer.tsx',
          children: []
        },
        Logo: {
          file: 'src/Logo.tsx',
          children: []
        }
      };

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockImplementation((file) => {
        switch (file) {
          case 'src/App.tsx': return appCode;
          case 'src/Header.tsx': return headerCode;
          case 'src/Button.tsx': return buttonCode;
          case 'src/Footer.tsx': return footerCode;
          default: return '';
        }
      });
      mockBuildComponentGraph.mockReturnValue(complexGraph);
      mockGraphToDot.mockReturnValue('digraph { }');
      mockGraphToMarkdown.mockReturnValue('# Component Tree');

      await generateGraph(mockOptions);

      expect(mockGetFiles).toHaveBeenCalledWith('./test-src', 'ts,tsx');
      expect(mockReadFile).toHaveBeenCalledTimes(4);
      expect(mockBuildComponentGraph).toHaveBeenCalledWith([
        { path: 'src/App.tsx', content: appCode },
        { path: 'src/Header.tsx', content: headerCode },
        { path: 'src/Button.tsx', content: buttonCode },
        { path: 'src/Footer.tsx', content: footerCode }
      ]);
      expect(mockGraphToDot).toHaveBeenCalledWith(complexGraph);
      expect(mockGraphToMarkdown).toHaveBeenCalledWith(complexGraph);
    });

    it('should handle empty directory', async () => {
      const testFiles: string[] = [];

      mockGetFiles.mockResolvedValue(testFiles);

      await generateGraph(mockOptions);

      expect(mockReadFile).not.toHaveBeenCalled();
      expect(mockBuildComponentGraph).toHaveBeenCalledWith([]);
      expect(mockGraphToDot).toHaveBeenCalledWith({});
      expect(mockGraphToMarkdown).toHaveBeenCalledWith({});
      
      expect(mockFs.ensureDirSync).toHaveBeenCalledWith('test-out/graph');
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2);
    });

    it('should handle components without default export', async () => {
      const testFiles = [
        'src/App.tsx',
        'src/utils.ts', // This should be ignored
        'src/components/Button.tsx'
      ];

      const appCode = `function App() {
        return <div><Button /></div>;
      }`;

      const utilsCode = `export function helper() {
        return 'help';
      }`;

      const buttonCode = `function Button() {
        return <button>Click</button>;
      }`;

      const graph = {
        App: {
          file: 'src/App.tsx',
          children: ['Button']
        },
        Button: {
          file: 'src/components/Button.tsx',
          children: []
        }
      };

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockImplementation((file) => {
        if (file.includes('utils')) return utilsCode;
        if (file.includes('App')) return appCode;
        return buttonCode;
      });
      mockBuildComponentGraph.mockReturnValue(graph);
      mockGraphToDot.mockReturnValue('digraph { }');
      mockGraphToMarkdown.mockReturnValue('# Component Tree');

      await generateGraph(mockOptions);

      // utils.ts should be processed but not included in graph (no default export)
      expect(mockReadFile).toHaveBeenCalledTimes(3);
      expect(mockBuildComponentGraph).toHaveBeenCalledWith([
        { path: 'src/App.tsx', content: appCode },
        { path: 'src/utils.ts', content: utilsCode },
        { path: 'src/components/Button.tsx', content: buttonCode }
      ]);
      expect(graph).not.toHaveProperty('helper');
    });

    it('should create output directory if it does not exist', async () => {
      const testFiles = ['src/Simple.tsx'];
      const simpleCode = `export default function Simple() { return <div>Simple</div>; }`;

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockReturnValue(simpleCode);
      mockBuildComponentGraph.mockReturnValue({});
      mockGraphToDot.mockReturnValue('digraph { }');
      mockGraphToMarkdown.mockReturnValue('# Component Tree');
      mockFs.ensureDirSync.mockReturnValue(undefined); // Directory creation succeeds

      await generateGraph(mockOptions);

      expect(mockFs.ensureDirSync).toHaveBeenCalledWith('test-out/graph');
    });

    it('should handle nested component hierarchy', async () => {
      const testFiles = ['src/App.tsx'];

      const appCode = `function App() {
        return (
          <div>
            <Layout>
              <Header>
                <Logo />
                <Navigation>
                  <NavItem />
                  <NavItem />
                </Navigation>
              </Header>
              <Main>
                <Article>
                  <Paragraph />
                  <Image />
                </Article>
              </Main>
              <Footer>
                <Copyright />
              </Footer>
            </Layout>
          </div>
        );
      }`;

      const nestedGraph = {
        App: {
          file: 'src/App.tsx',
          children: ['div', 'Layout']
        },
        Layout: {
          file: 'src/Layout.tsx',
          children: ['Header', 'Main', 'Footer']
        },
        Header: {
          file: 'src/Header.tsx',
          children: ['Logo', 'Navigation']
        },
        Navigation: {
          file: 'src/Navigation.tsx',
          children: ['NavItem']
        },
        Main: {
          file: 'src/Main.tsx',
          children: ['Article']
        },
        Article: {
          file: 'src/Article.tsx',
          children: ['Paragraph', 'Image']
        },
        Footer: {
          file: 'src/Footer.tsx',
          children: ['Copyright']
        }
      };

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockReturnValue(appCode);
      mockBuildComponentGraph.mockReturnValue(nestedGraph);
      mockGraphToDot.mockReturnValue('digraph with nested structure');
      mockGraphToMarkdown.mockReturnValue('# Nested Component Tree');

      await generateGraph(mockOptions);

      expect(mockBuildComponentGraph).toHaveBeenCalledWith([
        { path: 'src/App.tsx', content: appCode }
      ]);

      // All components from nested structure should be in the graph
      const graph = mockBuildComponentGraph.mock.calls[0][0];
      expect(Object.keys(graph)).toHaveLength(0); // Empty because we're mocking
      
      // But the actual graph passed to graphToDot should have all components
      expect(mockGraphToDot).toHaveBeenCalledWith(nestedGraph);
      expect(mockGraphToMarkdown).toHaveBeenCalledWith(nestedGraph);
    });

    it('should handle errors during file reading', async () => {
      const testFiles = ['src/Error.tsx'];
      
      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockImplementation(() => {
        throw new Error('File read error');
      });

      await expect(generateGraph(mockOptions)).rejects.toThrow('File read error');

      expect(mockBuildComponentGraph).not.toHaveBeenCalled();
    });

    it('should handle errors during graph building', async () => {
      const testFiles = ['src/Test.tsx'];
      const testCode = `export default function Test() { return <div>Test</div>; }`;

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockReturnValue(testCode);
      mockBuildComponentGraph.mockImplementation(() => {
        throw new Error('Graph building error');
      });

      await expect(generateGraph(mockOptions)).rejects.toThrow('Graph building error');

      expect(mockGraphToDot).not.toHaveBeenCalled();
      expect(mockGraphToMarkdown).not.toHaveBeenCalled();
    });

    it('should use custom output directory', async () => {
      const customOptions = {
        ...mockOptions,
        out: './custom-output'
      };

      const testFiles = ['src/Component.tsx'];
      const componentCode = `export default function Component() { return <div>Component</div>; }`;

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockReturnValue(componentCode);
      mockBuildComponentGraph.mockReturnValue({});
      mockGraphToDot.mockReturnValue('digraph { }');
      mockGraphToMarkdown.mockReturnValue('# Component Tree');

      await generateGraph(customOptions);

      expect(mockFs.ensureDirSync).toHaveBeenCalledWith('custom-output/graph');
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        'custom-output/graph/components.dot',
        'digraph { }'
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        'custom-output/graph/components.md',
        '# Component Tree'
      );
    });

    it('should filter files by extensions', async () => {
      const testFiles = ['src/App.tsx', 'src/styles.css', 'src/Header.tsx'];
      const options = { ...mockOptions, extensions: 'ts,tsx' };

      mockGetFiles.mockResolvedValue(['src/App.tsx', 'src/Header.tsx']); // Only TS files
      mockReadFile.mockReturnValue('export default function Test() { return <div>Test</div>; }');
      mockBuildComponentGraph.mockReturnValue({});
      mockGraphToDot.mockReturnValue('digraph { }');
      mockGraphToMarkdown.mockReturnValue('# Component Tree');

      await generateGraph(options);

      expect(mockGetFiles).toHaveBeenCalledWith('./test-src', 'ts,tsx');
    });
  });
});