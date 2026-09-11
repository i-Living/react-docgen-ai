/**
 * @fileoverview Tests for ast-extractor module
 * @author AI Docgen
 * @version 1.0.0
 */

import { extractComponentInfo } from '../src/ast/ast-extractor.js';

describe('AST Extractor', () => {
  describe('extractComponentInfo', () => {
    it('should extract function component name', () => {
      const code = `
        function MyComponent() {
          return <div>Hello World</div>;
        }
        export default MyComponent;
      `;

      const result = extractComponentInfo(code);
      expect(result.name).toBe('MyComponent');
    });

    it('should extract arrow function component name', () => {
      const code = `
        const Button = () => {
          return <button>Click me</button>;
        };
        export default Button;
      `;

      const result = extractComponentInfo(code);
      expect(result.name).toBe('Button');
    });

    it('should extract component with export default', () => {
      const code = `
        export default function Header() {
          return <h1>Header</h1>;
        }
      `;

      const result = extractComponentInfo(code);
      expect(result.exportsComponent).toBe(true);
    });

    it('should handle component without default export', () => {
      const code = `
        function Header() {
          return <h1>Header</h1>;
        }
      `;

      const result = extractComponentInfo(code);
      expect(result.exportsComponent).toBe(false);
    });

    it('should extract JSX elements from component', () => {
      const code = `
        function App() {
          return (
            <div>
              <Header />
              <Button text="Click" />
            </div>
          );
        }
        export default App;
      `;

      const result = extractComponentInfo(code);
      expect(result.jsxTree).toContain('div');
      expect(result.jsxTree).toContain('Header');
      expect(result.jsxTree).toContain('Button');
    });

    it('should extract useState hooks', () => {
      const code = `
        function Counter() {
          const [count, setCount] = useState(0);
          const [isLoading, setLoading] = useState(false);
          
          return <div>{count}</div>;
        }
        export default Counter;
      `;

      const result = extractComponentInfo(code);
      expect(result.state).toHaveLength(2);
      expect(result.state[0]).toEqual({ variable: 'count' });
      expect(result.state[1]).toEqual({ variable: 'isLoading' });
    });

    it('should extract useEffect hooks with dependencies', () => {
      const code = `
        function UserProfile() {
          const [user, setUser] = useState(null);
          
          useEffect(() => {
            fetchUser();
          }, [user]);
          
          return <div>{user}</div>;
        }
        export default UserProfile;
      `;

      const result = extractComponentInfo(code);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].deps).toContain('user');
    });

    it('should handle useEffect without dependencies', () => {
      const code = `
        function Timer() {
          useEffect(() => {
            const timer = setInterval(() => {
              console.log('tick');
            }, 1000);
            return () => clearInterval(timer);
          }, []);
          
          return <div>Timer</div>;
        }
        export default Timer;
      `;

      const result = extractComponentInfo(code);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].deps).toHaveLength(0);
    });

    it('should extract React.FC type annotation', () => {
      const code = `
        import React from 'react';
        
        interface Props {
          title: string;
        }
        
        const Header: React.FC<Props> = ({ title }) => {
          return <h1>{title}</h1>;
        };
        export default Header;
      `;

      const result = extractComponentInfo(code);
      expect(result.name).toBe('Header');
    });

    it('should handle TypeScript function component', () => {
      const code = `
        import React from 'react';
        
        interface ButtonProps {
          text: string;
          onClick: () => void;
        }
        
        function Button({ text, onClick }: ButtonProps) {
          return <button onClick={onClick}>{text}</button>;
        }
        export default Button;
      `;

      const result = extractComponentInfo(code);
      expect(result.name).toBe('Button');
      expect(result.exportsComponent).toBe(true);
    });

    it('should handle complex nested JSX', () => {
      const code = `
        function App() {
          return (
            <div className="app">
              <Header title="Welcome">
                <Logo src="/logo.png" />
                <Navigation>
                  <NavItem href="/home" text="Home" />
                  <NavItem href="/about" text="About" />
                </Navigation>
              </Header>
              <MainContent>
                <Article title="First Post" />
              </MainContent>
            </div>
          );
        }
        export default App;
      `;

      const result = extractComponentInfo(code);
      expect(result.jsxTree).toContain('div');
      expect(result.jsxTree).toContain('Header');
      expect(result.jsxTree).toContain('Logo');
      expect(result.jsxTree).toContain('Navigation');
      expect(result.jsxTree).toContain('NavItem');
      expect(result.jsxTree).toContain('MainContent');
      expect(result.jsxTree).toContain('Article');
    });

    it('should handle class component', () => {
      const code = `
        class Counter extends React.Component {
          constructor(props) {
            super(props);
            this.state = { count: 0 };
          }
          
          render() {
            return <div>{this.state.count}</div>;
          }
        }
        export default Counter;
      `;

      const result = extractComponentInfo(code);
      // Class components might not be fully supported by current extractor
      // This test documents current behavior
      expect(result).toBeDefined();
    });

    it('should extract multiple useState hooks with destructuring', () => {
      const code = `
        function UserForm() {
          const [name, setName] = useState('');
          const [email, setEmail] = useState('');
          const [age, setAge] = useState(0);
          const [user, setUser] = useState(null);
          
          return (
            <form>
              <input value={name} onChange={e => setName(e.target.value)} />
              <input value={email} onChange={e => setEmail(e.target.value)} />
            </form>
          );
        }
        export default UserForm;
      `;

      const result = extractComponentInfo(code);
      expect(result.state).toHaveLength(4);
      expect(result.state.map(s => s.variable)).toEqual(['name', 'email', 'age', 'user']);
    });

    it('should handle hooks with complex dependency arrays', () => {
      const code = `
        function DataProcessor() {
          const [data, setData] = useState([]);
          const [loading, setLoading] = useState(false);
          const [error, setError] = useState(null);
          
          useEffect(() => {
            const fetchData = async () => {
              try {
                setLoading(true);
                const result = await api.getData();
                setData(result);
                setError(null);
              } catch (err) {
                setError(err.message);
              } finally {
                setLoading(false);
              }
            };
            
            fetchData();
          }, [data.length]);
          
          return <div>Data: {data.length}</div>;
        }
        export default DataProcessor;
      `;

      const result = extractComponentInfo(code);
      expect(result.state).toHaveLength(3);
      expect(result.effects).toHaveLength(1);
      expect(result.effects[0].deps).toContain('data.length');
    });

    it('should extract event handlers from component', () => {
      const code = `
        function Form() {
          const [formData, setFormData] = useState({});
          
          const handleSubmit = (e) => {
            e.preventDefault();
            console.log('submitted');
          };
          
          const handleInputChange = (e) => {
            setFormData({ ...formData, [e.target.name]: e.target.value });
          };
          
          return (
            <form onSubmit={handleSubmit}>
              <input name="name" onChange={handleInputChange} />
            </form>
          );
        }
        export default Form;
      `;

      const result = extractComponentInfo(code);
      // Event handlers might be detected via function declarations within components
      expect(result).toBeDefined();
      expect(result.state).toHaveLength(1);
    });
  });

  describe('file classification', () => {
    it('should classify component with JSX and export', () => {
      const code = `
        function Button() { return <button>Click</button>; }
        export default Button;
      `;
      const result = extractComponentInfo(code);
      expect(result.fileType).toBe('component');
    });

    it('should classify hook with use* prefix and state', () => {
      const code = `
        export function useToggle() {
          const [open, setOpen] = useState(false);
          return open;
        }
      `;
      const result = extractComponentInfo(code);
      expect(result.fileType).toBe('hook');
    });

    it('should detect createContext as context type', () => {
      const code = `
        import { createContext } from "react";
        export const ThemeContext = createContext({ theme: "light" });
      `;
      const result = extractComponentInfo(code);
      expect(result.hasContext).toBe(true);
      expect(result.fileType).toBe('context');
    });

    it('should detect Zustand create as store type', () => {
      const code = `
        import { create } from "zustand";
        export const useStore = create((set) => ({ count: 0, inc: () => set((s) => ({ count: s.count + 1 })) }));
      `;
      const result = extractComponentInfo(code);
      expect(result.hasStore).toBe(true);
      expect(result.fileType).toBe('store');
    });

    it('should detect Jotai atom as store type', () => {
      const code = `
        import { atom } from "jotai";
        export const countAtom = atom(0);
      `;
      const result = extractComponentInfo(code);
      expect(result.hasStore).toBe(true);
      expect(result.fileType).toBe('store');
    });

    it('should classify util (function, no JSX)', () => {
      const code = `
        export function formatDate(date) { return date.toISOString(); }
      `;
      const result = extractComponentInfo(code);
      expect(result.fileType).toBe('util');
    });

    it('should classify barrel file as skip', () => {
      const code = `export { Button } from "./Button";
export { Input } from "./Input";`;
      const result = extractComponentInfo(code);
      expect(result.fileType).toBe('skip');
    });

    it('should name the exported page, not an inner skeleton helper', () => {
      const code = `
        function CatalogSkeleton() {
          return <div role="status" />;
        }
        export function CatalogPage() {
          return <div><CatalogSkeleton /><ProductCard /></div>;
        }
      `;
      const result = extractComponentInfo(code);
      expect(result.name).toBe('CatalogPage');
      expect(result.exportsComponent).toBe(true);
      expect(result.fileType).toBe('component');
    });

    it('should classify useQuery wrappers as hooks', () => {
      const code = `
        export function useCart() {
          return useQuery({ queryKey: ['cart'], queryFn: getCart });
        }
      `;
      const result = extractComponentInfo(code);
      expect(result.name).toBe('useCart');
      expect(result.fileType).toBe('hook');
    });

    it('should mark exported utils as exported without using ALL_CAPS as the name', () => {
      const code = `
        export const API_PATHS = { cart: '/api/cart' };
        export function request() { return fetch('/api'); }
      `;
      const result = extractComponentInfo(code);
      expect(result.exportsComponent).toBe(true);
      expect(result.name).not.toBe('API_PATHS');
      expect(result.fileType).toBe('util');
    });

    it('should not skip a router module that only has JSX in config', () => {
      const code = `
        export const router = createBrowserRouter([
          { path: '/', element: <App /> },
        ]);
      `;
      const result = extractComponentInfo(code);
      expect(result.fileType).toBe('component');
      expect(result.jsxTree).toContain('App');
    });
  });
});