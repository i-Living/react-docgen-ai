/**
 * @fileoverview Тесты для модуля component-graph
 * @author AI Docgen
 * @version 1.0.0
 */

import { buildComponentGraph, graphToDot, graphToMarkdown } from '../dist/ast/component-graph.js';
import { FileInfo } from '../dist/types.js';

describe('Component Graph', () => {
  describe('buildComponentGraph', () => {
    it('should build graph from single component', () => {
      const files: FileInfo[] = [
        {
          path: 'src/components/Button.tsx',
          content: `
            function Button() {
              return <button>Click me</button>;
            }
            export default Button;
          `
        }
      ];

      const result = buildComponentGraph(files);
      expect(result).toHaveProperty('Button');
      expect(result.Button.file).toBe('src/components/Button.tsx');
      expect(result.Button.children).toEqual([]);
    });

    it('should extract child components from JSX', () => {
      const files: FileInfo[] = [
        {
          path: 'src/components/App.tsx',
          content: `
            function App() {
              return (
                <div>
                  <Header title="Welcome" />
                  <Button text="Click" />
                  <Footer />
                </div>
              );
            }
            export default App;
          `
        }
      ];

      const result = buildComponentGraph(files);
      expect(result).toHaveProperty('App');
      expect(result.App.children).toContain('Header');
      expect(result.App.children).toContain('Button');
      expect(result.App.children).toContain('Footer');
    });

    it('should ignore lowercase JSX elements', () => {
      const files: FileInfo[] = [
        {
          path: 'src/components/Form.tsx',
          content: `
            function Form() {
              return (
                <form>
                  <input type="text" />
                  <div className="container">
                    <span>Content</span>
                  </div>
                </form>
              );
            }
            export default Form;
          `
        }
      ];

      const result = buildComponentGraph(files);
      expect(result).toHaveProperty('Form');
      expect(result.Form.children).toEqual([]);
      expect(result.Form.children).not.toContain('input');
      expect(result.Form.children).not.toContain('div');
      expect(result.Form.children).not.toContain('span');
    });

    it('should handle multiple components', () => {
      const files: FileInfo[] = [
        {
          path: 'src/components/Header.tsx',
          content: `
            function Header() {
              return <h1>Header</h1>;
            }
            export default Header;
          `
        },
        {
          path: 'src/components/Button.tsx',
          content: `
            const Button = () => <button>Click</button>;
            export default Button;
          `
        },
        {
          path: 'src/components/Footer.tsx',
          content: `
            function Footer() {
              return <footer>Footer</footer>;
            }
            export default Footer;
          `
        }
      ];

      const result = buildComponentGraph(files);
      expect(result).toHaveProperty('Header');
      expect(result).toHaveProperty('Button');
      expect(result).toHaveProperty('Footer');
      expect(Object.keys(result)).toHaveLength(3);
    });

    it('should use filename as component name when name not found in code', () => {
      const files: FileInfo[] = [
        {
          path: 'src/components/CustomButton.tsx',
          content: `
            export default function () {
              return <button>Custom</button>;
            }
          `
        }
      ];

      const result = buildComponentGraph(files);
      expect(result).toHaveProperty('CustomButton');
      expect(result.CustomButton.file).toBe('src/components/CustomButton.tsx');
    });

    it('should skip files without default export', () => {
      const files: FileInfo[] = [
        {
          path: 'src/utils/helper.ts',
          content: `
            export function helper() {
              return 'help';
            }
          `
        },
        {
          path: 'src/components/Component.tsx',
          content: `
            function Component() {
              return <div>Component</div>;
            }
            export default Component;
          `
        }
      ];

      const result = buildComponentGraph(files);
      expect(result).toHaveProperty('Component');
      expect(result).not.toHaveProperty('helper');
      expect(Object.keys(result)).toHaveLength(1);
    });

    it('should handle complex nested components', () => {
      const files: FileInfo[] = [
        {
          path: 'src/components/App.tsx',
          content: `
            function App() {
              return (
                <div>
                  <Header>
                    <Logo />
                    <Navigation>
                      <NavItem />
                      <NavItem />
                    </Navigation>
                  </Header>
                  <MainContent>
                    <Article />
                  </MainContent>
                </div>
              );
            }
            export default App;
          `
        }
      ];

      const result = buildComponentGraph(files);
      expect(result).toHaveProperty('App');
      const children = result.App.children;
      expect(children).toContain('Header');
      expect(children).toContain('MainContent');
      expect(children).toContain('Logo');
      expect(children).toContain('Navigation');
      expect(children).toContain('NavItem');
      expect(children).toContain('Article');
    });

    it('should handle TypeScript components with interfaces', () => {
      const files: FileInfo[] = [
        {
          path: 'src/components/UserCard.tsx',
          content: `
            interface UserCardProps {
              name: string;
              email: string;
            }
            
            const UserCard: React.FC<UserCardProps> = ({ name, email }) => {
              return (
                <div>
                  <Avatar />
                  <h3>{name}</h3>
                  <p>{email}</p>
                </div>
              );
            };
            export default UserCard;
          `
        }
      ];

      const result = buildComponentGraph(files);
      expect(result).toHaveProperty('UserCard');
      expect(result.UserCard.children).toContain('Avatar');
    });

    it('should handle components with JSX fragments', () => {
      const files: FileInfo[] = [
        {
          path: 'src/components/FragmentExample.tsx',
          content: `
            function FragmentExample() {
              return (
                <>
                  <Header />
                  <MainContent />
                  <Footer />
                </>
              );
            }
            export default FragmentExample;
          `
        }
      ];

      const result = buildComponentGraph(files);
      expect(result).toHaveProperty('FragmentExample');
      expect(result.FragmentExample.children).toContain('Header');
      expect(result.FragmentExample.children).toContain('MainContent');
      expect(result.FragmentExample.children).toContain('Footer');
    });
  });

  describe('graphToDot', () => {
    it('should generate DOT format for simple graph', () => {
      const graph = {
        App: {
          file: 'src/App.tsx',
          children: ['Header', 'Button']
        },
        Header: {
          file: 'src/Header.tsx',
          children: ['Logo']
        },
        Button: {
          file: 'src/Button.tsx',
          children: []
        },
        Logo: {
          file: 'src/Logo.tsx',
          children: []
        }
      };

      const result = graphToDot(graph);
      expect(result).toContain('digraph Components {');
      expect(result).toContain('node [shape=box, style=filled, fillcolor=lightblue];');
      expect(result).toContain('edge [color=gray];');
      expect(result).toContain('"App" -> "Header"');
      expect(result).toContain('"App" -> "Button"');
      expect(result).toContain('"Header" -> "Logo"');
      expect(result).toContain('}');
      expect(result).toContain('App.tsx');
      expect(result).toContain('Header.tsx');
    });

    it('should handle empty graph', () => {
      const graph = {};
      const result = graphToDot(graph);
      expect(result).toBe('digraph Components {\n  // Настройки отображения графа\n  node [shape=box, style=filled, fillcolor=lightblue];\n  edge [color=gray];\n\n}\n');
    });

    it('should escape special characters in file names', () => {
      const graph = {
        'My-App': {
          file: 'src/my-app/components/Test.tsx',
          children: ['Other-Component']
        }
      };

      const result = graphToDot(graph);
      expect(result).toContain('"My-App"');
      expect(result).toContain('Test.tsx');
    });
  });

  describe('graphToMarkdown', () => {
    it('should generate Markdown format for simple graph', () => {
      const graph = {
        App: {
          file: 'src/App.tsx',
          children: ['Header', 'Button']
        },
        Header: {
          file: 'src/Header.tsx',
          children: ['Logo']
        },
        Button: {
          file: 'src/Button.tsx',
          children: []
        }
      };

      const result = graphToMarkdown(graph);
      expect(result).toContain('# Component Tree');
      expect(result).toContain('## App');
      expect(result).toContain('**Файл:** `src/App.tsx`');
      expect(result).toContain('**Дочерние компоненты:**');
      expect(result).toContain('- Header');
      expect(result).toContain('- Button');
      expect(result).toContain('---');
    });

    it('should handle component with no children', () => {
      const graph = {
        Button: {
          file: 'src/Button.tsx',
          children: []
        }
      };

      const result = graphToMarkdown(graph);
      expect(result).toContain('## Button');
      expect(result).toContain('**Дочерние компоненты:** ➡️ Нет');
    });

    it('should handle empty graph', () => {
      const graph = {};
      const result = graphToMarkdown(graph);
      expect(result).toBe('# Component Tree\n\nИерархия React компонентов проекта.\n\n');
    });

    it('should format multiple components correctly', () => {
      const graph = {
        App: {
          file: 'src/App.tsx',
          children: ['Header']
        },
        Header: {
          file: 'src/components/Header.tsx',
          children: ['Logo', 'Navigation']
        },
        Logo: {
          file: 'src/components/Logo.tsx',
          children: []
        }
      };

      const result = graphToMarkdown(graph);
      expect(result).toContain('## App');
      expect(result).toContain('## Header');
      expect(result).toContain('## Logo');
      expect(result).toContain('---');
      expect(result).toContain('**Дочерние компоненты:**');
      expect(result).toContain('- Logo');
      expect(result).toContain('- Navigation');
    });
  });

  describe('Integration tests', () => {
    it('should build graph from real component files and convert to both formats', () => {
      const files: FileInfo[] = [
        {
          path: 'src/App.tsx',
          content: `
            function App() {
              return (
                <div>
                  <Header />
                  <Main />
                  <Footer />
                </div>
              );
            }
            export default App;
          `
        },
        {
          path: 'src/Header.tsx',
          content: `
            function Header() {
              return <header><Logo /></header>;
            }
            export default Header;
          `
        },
        {
          path: 'src/Main.tsx',
          content: `
            export default function Main() {
              return <main><Article /></main>;
            }
          `
        },
        {
          path: 'src/utils/helper.ts',
          content: 'export const helper = () => {};'
        }
      ];

      const graph = buildComponentGraph(files);
      const dot = graphToDot(graph);
      const markdown = graphToMarkdown(graph);

      expect(graph).toHaveProperty('App');
      expect(graph).toHaveProperty('Header');
      expect(graph).toHaveProperty('Main');
      expect(graph).not.toHaveProperty('helper');

      expect(dot).toContain('digraph Components');
      expect(dot).toContain('"App" -> "Header"');
      expect(dot).toContain('"App" -> "Main"');
      expect(dot).toContain('"Header" -> "Logo"');
      expect(dot).toContain('"Main" -> "Article"');

      expect(markdown).toContain('# Component Tree');
      expect(markdown).toContain('## App');
      expect(markdown).toContain('## Header');
      expect(markdown).toContain('## Main');
    });
  });
});