/**
 * @fileoverview Тесты для модуля docgen
 * @author AI Docgen
 * @version 1.0.0
 */

import { generateDocs } from '../src/docgen.js';
import { getFiles, readFile, getDocFiles, writeOutput } from '../src/file-utils.js';
import { callLLM } from '../src/llm-client.js';
import { extractComponentInfo } from '../src/ast/ast-extractor.js';
import { getDocumentationPrompt } from '../src/prompt-loader.js';
import fs from 'fs-extra';

jest.mock('../src/file-utils.js');
jest.mock('../src/llm-client.js');
jest.mock('../src/ast/ast-extractor.js');
jest.mock('../src/prompt-loader.js');
jest.mock('fs-extra');
jest.mock('globby');

describe('Docgen', () => {
  const mockGetFiles = getFiles as jest.MockedFunction<typeof getFiles>;
  const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
  const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;
  const mockExtractComponentInfo = extractComponentInfo as jest.MockedFunction<typeof extractComponentInfo>;
  const mockGetDocumentationPrompt = getDocumentationPrompt as jest.MockedFunction<typeof getDocumentationPrompt>;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockGetDocFiles = getDocFiles as jest.MockedFunction<typeof getDocFiles>;
  const mockWriteOutput = writeOutput as jest.MockedFunction<typeof writeOutput>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDocFiles.mockResolvedValue([]);
  });

  describe('generateDocs', () => {
    const mockOptions = {
      src: './test-src',
      out: './test-out',
      annotate: false,
      docs: true,
      graph: false,
      extensions: 'ts,tsx',
      api: 'http://localhost:8000/completions'
    };

    it('should generate documentation for single component', async () => {
      const testFiles = ['src/Button.tsx'];
      const buttonCode = `
        interface ButtonProps {
          text: string;
          onClick: () => void;
        }
        function Button({ text, onClick }: ButtonProps) {
          return <button onClick={onClick}>{text}</button>;
        }
        export default Button;
      `;
      
      const componentInfo = {
        name: 'Button',
        props: [{ name: 'text', type: 'string' }, { name: 'onClick', type: 'function' }],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: ['button'],
        exportsComponent: true
      };

      const documentation = '# Button Component\n\nA button component with text and click handler.\n\n## Props\n\n- `text`: string - Button text\n- `onClick`: function - Click handler';

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockReturnValue(buttonCode);
      mockExtractComponentInfo.mockReturnValue(componentInfo);
      mockGetDocumentationPrompt.mockReturnValue('Generate docs for Button component');
      mockCallLLM.mockResolvedValue(documentation);

      await generateDocs(mockOptions);

      expect(mockGetFiles).toHaveBeenCalledWith('./test-src', 'ts,tsx');
      expect(mockReadFile).toHaveBeenCalledWith('src/Button.tsx');
      expect(mockExtractComponentInfo).toHaveBeenCalledWith(buttonCode);
      expect(mockGetDocumentationPrompt).toHaveBeenCalledWith(componentInfo, buttonCode);
      expect(mockCallLLM).toHaveBeenCalledWith(
        'http://localhost:8000/completions',
        'Generate docs for Button component'
      );
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it('should generate documentation for multiple components', async () => {
      const testFiles = ['src/Button.tsx', 'src/Header.tsx', 'src/Footer.tsx'];
      
      const buttonCode = 'function Button() { return <button>Click</button>; } export default Button;';
      const headerCode = 'function Header() { return <h1>Header</h1>; } export default Header;';
      const footerCode = 'function Footer() { return <footer>Footer</footer>; } export default Footer;';

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockImplementation((file) => {
        switch (file) {
          case 'src/Button.tsx': return buttonCode;
          case 'src/Header.tsx': return headerCode;
          case 'src/Footer.tsx': return footerCode;
          default: return '';
        }
      });

      mockExtractComponentInfo.mockImplementation((code) => ({
        name: code.includes('Button') ? 'Button' : code.includes('Header') ? 'Header' : 'Footer',
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: [code.includes('button') ? 'button' : code.includes('h1') ? 'h1' : 'footer'],
        exportsComponent: true
      }));

      mockGetDocumentationPrompt.mockReturnValue('Generate docs');
      mockCallLLM.mockResolvedValue('# Component Documentation\n\nThis component provides UI rendering functionality.\n\n## Props\n- **text**: string - The display text\n');

      await generateDocs(mockOptions);

      expect(mockGetFiles).toHaveBeenCalledWith('./test-src', 'ts,tsx');
      expect(mockReadFile).toHaveBeenCalledTimes(3);
      expect(mockExtractComponentInfo).toHaveBeenCalledTimes(3);
      expect(mockGetDocumentationPrompt).toHaveBeenCalledTimes(3);
      expect(mockCallLLM).toHaveBeenCalledTimes(3);
    });

    it('should handle file without default export', async () => {
      const testFiles = ['src/utils.ts'];
      const utilsCode = 'export function helper() { return "help"; }';

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockReturnValue(utilsCode);

      const componentInfo = {
        name: null,
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: [],
        exportsComponent: false
      };

      mockExtractComponentInfo.mockReturnValue(componentInfo);
      mockGetDocumentationPrompt.mockReturnValue('Generate docs');

      await generateDocs(mockOptions);

      // Component without export should still be processed (LLM can generate docs for non-default exports)
      expect(mockGetDocumentationPrompt).toHaveBeenCalledWith(componentInfo, utilsCode);
      expect(mockCallLLM).toHaveBeenCalledTimes(1);
    });

    it('should create markdown files in output directory', async () => {
      const testFiles = ['src/components/Button.tsx'];
      const buttonCode = 'function Button() { return <button>Click</button>; } export default Button;';
      const documentation = '# Button Component\n\nA button component with display text and click handling.';

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockReturnValue(buttonCode);
      mockExtractComponentInfo.mockReturnValue({
        name: 'Button',
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: ['button'],
        exportsComponent: true
      });
      mockGetDocumentationPrompt.mockReturnValue('Prompt');
      mockCallLLM.mockResolvedValue(documentation);

      await generateDocs(mockOptions);

      // Check that writeOutput was called with correct path transformation
      expect(mockWriteOutput).toHaveBeenCalledWith(
        expect.stringContaining('test-out'),
        expect.any(String),
        documentation
      );
    });

    it('should handle errors gracefully', async () => {
      const testFiles = ['src/Button.tsx'];
      const buttonCode = 'function Button() { return <button>Click</button>; } export default Button;';

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockReturnValue(buttonCode);
      mockExtractComponentInfo.mockReturnValue({
        name: 'Button',
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: ['button'],
        exportsComponent: true
      });
      mockGetDocumentationPrompt.mockReturnValue('Prompt');
      
      const llmError = new Error('LLM API Error');
      mockCallLLM.mockRejectedValue(llmError);

      await expect(generateDocs(mockOptions)).rejects.toThrow('LLM API Error');
    });

    it('should use custom API endpoint', async () => {
      const customOptions = {
        ...mockOptions,
        api: 'http://custom-llm:9000/api/generate'
      };

      const testFiles = ['src/Test.tsx'];
      const testCode = 'export default function Test() { return <div>Test</div>; }';

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockReturnValue(testCode);
      mockExtractComponentInfo.mockReturnValue({
        name: 'Test',
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: ['div'],
        exportsComponent: true
      });
      mockGetDocumentationPrompt.mockReturnValue('Prompt');
      mockCallLLM.mockResolvedValue('# Component Documentation\n\nThis component provides UI rendering functionality.\n\n## Props\n- **text**: string - The display text\n');

      await generateDocs(customOptions);

      expect(mockCallLLM).toHaveBeenCalledWith(
        'http://custom-llm:9000/api/generate',
        'Prompt'
      );
    });

    it('should process different file extensions correctly', async () => {
      const testFiles = ['src/Button.tsx', 'src/Header.jsx', 'src/Footer.ts', 'src/Sidebar.js'];
      
      const options = { ...mockOptions, extensions: 'ts,tsx,js,jsx' };

      mockGetFiles.mockResolvedValue(testFiles);
      
      // Mock all files to have valid component code
      mockReadFile.mockReturnValue('export default function Test() { return <div>Test</div>; }');
      mockExtractComponentInfo.mockReturnValue({
        name: 'Test',
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: ['div'],
        exportsComponent: true
      });
      mockGetDocumentationPrompt.mockReturnValue('Prompt');
      mockCallLLM.mockResolvedValue('# Component Documentation\n\nThis component provides UI rendering functionality.\n\n## Props\n- **text**: string - The display text\n');

      await generateDocs(options);

      expect(mockGetFiles).toHaveBeenCalledWith('./test-src', 'ts,tsx,js,jsx');
      expect(mockReadFile).toHaveBeenCalledTimes(4);
      expect(mockExtractComponentInfo).toHaveBeenCalledTimes(4);
      expect(mockCallLLM).toHaveBeenCalledTimes(4);
    });

    it('should handle empty directory', async () => {
      const testFiles: string[] = [];

      mockGetFiles.mockResolvedValue(testFiles);

      await generateDocs(mockOptions);

      expect(mockReadFile).not.toHaveBeenCalled();
      expect(mockExtractComponentInfo).not.toHaveBeenCalled();
      expect(mockCallLLM).not.toHaveBeenCalled();
    });

    it('should log progress information', async () => {
      const testFiles = ['src/Component.tsx'];
      const componentCode = 'export default function Component() { return <div>Test</div>; }';

      mockGetFiles.mockResolvedValue(testFiles);
      mockReadFile.mockReturnValue(componentCode);
      mockExtractComponentInfo.mockReturnValue({
        name: 'Component',
        props: [],
        state: [],
        effects: [],
        handlers: [],
        jsxTree: ['div'],
        exportsComponent: true
      });
      mockGetDocumentationPrompt.mockReturnValue('Prompt');
      mockCallLLM.mockResolvedValue('# Component Documentation\n\nThis component provides UI rendering functionality.\n\n## Props\n- **text**: string - The display text\n');

      // Capture console output
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await generateDocs(mockOptions);

      expect(consoleSpy).toHaveBeenCalledWith('\n📚 Hybrid Docgen: 1 files...\n');
      expect(consoleSpy).toHaveBeenCalledWith('\n✨ Hybrid documentation completed!');

      consoleSpy.mockRestore();
    });
  });
});