/**
 * @fileoverview AST-based extractor of React component information
 * @author AI Docgen  
 * @version 1.0.0
 */

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import { NodePath } from "@babel/traverse"
import * as t from "@babel/types";
import { ComponentInfo, FileType } from "../types.js";

/**
 * Extracts structural information about a React component from source code
 * @param code - Source code of React component
 * @returns Object with component information
 */
export function extractComponentInfo(code: string): ComponentInfo {
  // Parse code into AST with JSX and TypeScript support
  const ast = parse(code, {
    sourceType: "module" as const,
    plugins: ["jsx", "typescript"]
  });

  // Initialize structure for storing component info
  const info: ComponentInfo = {
    name: null,
    props: [],
    state: [],
    effects: [],
    handlers: [],
    jsxTree: [],
    exportsComponent: false,
    fileType: "skip",
    hasContext: false,
    hasStore: false,
  };
  const traverse = typeof _traverse === "function" ? _traverse : ((_traverse as any).default as typeof _traverse)

  // Traverse AST tree to extract information
  traverse(ast, {
    // Check default export
    ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
      info.exportsComponent = true;
      
      // If a function declaration is exported
      if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
        info.name = path.node.declaration.id.name;
      }
    },

    // Check named exports — only set exportsComponent when the exported
    // declaration looks like a component (name starts with uppercase).
    // This prevents utility functions (export function helper()) from
    // being included in the component graph.
    ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
      // Has a declaration (export function / export const / export class)
      if (path.node.declaration) {
        // export function Button(...)
        if (t.isFunctionDeclaration(path.node.declaration) &&
            path.node.declaration.id &&
            path.node.declaration.id.name.charAt(0) === path.node.declaration.id.name.charAt(0).toUpperCase()) {
          info.exportsComponent = true;
        }
        // export const Button = ...
        if (t.isVariableDeclaration(path.node.declaration)) {
          for (const decl of path.node.declaration.declarations) {
            if (t.isIdentifier(decl.id) && decl.id.name.charAt(0) === decl.id.name.charAt(0).toUpperCase()) {
              info.exportsComponent = true;
            }
          }
        }
        // export class Button ...
        if (t.isClassDeclaration(path.node.declaration) &&
            path.node.declaration.id &&
            path.node.declaration.id.name.charAt(0) === path.node.declaration.id.name.charAt(0).toUpperCase()) {
          info.exportsComponent = true;
        }
      }
      // Re-exports (export { Button }) — only for LOCAL specifiers (no source).
      // Skip barrel files (export { X } from "./module") — they have source.
      if (!path.node.source && path.node.specifiers && path.node.specifiers.length > 0) {
        for (const spec of path.node.specifiers) {
          if (t.isExportSpecifier(spec) && t.isIdentifier(spec.exported)) {
            const name = spec.exported.name;
            if (name.charAt(0) === name.charAt(0).toUpperCase()) {
              info.exportsComponent = true;
              if (!info.name) info.name = name;
            }
          }
        }
      }
    },

    // Extract function-component name
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      if (path.node.id) {
        const funcName = path.node.id.name;
        
        // If name starts with "use" — it is a React hook
        if (funcName.startsWith("use")) {
          if (!info.name) {
            info.name = funcName;
          }
        } else if (funcName.charAt(0) === funcName.charAt(0).toUpperCase()) {
          // If name starts with uppercase, it is a component
          if (!info.name) {
            info.name = funcName;
          }
        } else {
          // This is an event handler
          info.handlers.push({
            name: funcName
          });
        }
      }
    },

    // Process variables with functions (arrow and regular)
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (
        path.node.init &&
        (path.node.init.type === "ArrowFunctionExpression" ||
         path.node.init.type === "FunctionExpression")
      ) {
        if (t.isIdentifier(path.node.id)) {
          const funcName = path.node.id.name;
          
          // If name starts with "use" — it is a React hook
          if (funcName.startsWith("use")) {
            if (!info.name) {
              info.name = funcName;
            }
          } else if (funcName.charAt(0) === funcName.charAt(0).toUpperCase()) {
            // If name starts with uppercase, it is a component
            if (!info.name) {
              info.name = funcName;
            }
          } else {
            // This is an event handler
            info.handlers.push({
              name: funcName
            });
          }
        }
      }
    },

    // Analyze JSX elements
    JSXElement(path: NodePath<t.JSXElement>) {
      const opening = path.node.openingElement;
      
      // Extract component name from opening tag
      if (t.isJSXIdentifier(opening.name)) {
        info.jsxTree.push(opening.name.name);
      }
    },

    // Extract TypeScript interfaces for props
    TSInterfaceDeclaration(path: NodePath<t.TSInterfaceDeclaration>) {
      const interfaceName = path.node.id.name;
      
      // Look for interfaces that might be component props
      if (interfaceName.endsWith('Props') || interfaceName === 'Props') {
        // Extract interface properties
        for (const property of path.node.body.body) {
          if (t.isTSPropertySignature(property) && t.isIdentifier(property.key)) {
            const propName = property.key.name;
            let propType = 'any';
            
            // Extract property type
            if (property.typeAnnotation && t.isTSTypeAnnotation(property.typeAnnotation)) {
              propType = extractTypeString(property.typeAnnotation.typeAnnotation);
            }
            
            // Extract default value (if present)
            let defaultValue = undefined;
            if (property.typeAnnotation && t.isTSTypeAnnotation(property.typeAnnotation)) {
              const tsType = property.typeAnnotation.typeAnnotation;
              if (t.isTSUnionType(tsType)) {
                // Check literal types for default values
                for (const type of tsType.types) {
                  if (t.isTSLiteralType(type) && t.isStringLiteral(type.literal)) {
                    defaultValue = type.literal.value;
                    break;
                  }
                  if (t.isTSLiteralType(type) && t.isNumericLiteral(type.literal)) {
                    defaultValue = type.literal.value;
                    break;
                  }
                  if (t.isTSLiteralType(type) && t.isBooleanLiteral(type.literal)) {
                    defaultValue = type.literal.value;
                    break;
                  }
                }
              }
            }
            
            info.props.push({
              name: propName,
              type: propType,
              required: !property.optional,
              defaultValue: defaultValue
            });
          }
        }
      }
    },

    // Process React hooks and helper calls
    CallExpression(path: NodePath<t.CallExpression>) {
      // Check function calls by name
      if (t.isIdentifier(path.node.callee)) {
        const calleeName = path.node.callee.name;

        // Processing useState hooks
        if (calleeName === "useState") {
          // Look for variable declarator with destructuring in parent nodes
          let variablePath = path.findParent((p) => t.isVariableDeclarator(p.node));
          
          if (variablePath && t.isVariableDeclarator(variablePath.node)) {
            // Extract state variable name from destructuring
            const variableName = extractVariableName(variablePath.node.id);
            info.state.push({
              variable: variableName || "state"
            });
          }
        }

        // Processing useEffect hooks
        if (calleeName === "useEffect") {
          // Extract dependencies from second argument
          const deps = extractDependencies(path.node.arguments[1]);
          info.effects.push({
            deps: deps
          });
        }

        // Processing createContext (React Context)
        if (calleeName === "createContext") {
          info.hasContext = true;
        }

        // Processing state management: Zustand (create), Jotai (atom), Redux (createSlice)
        if (calleeName === "create" || calleeName === "atom" || calleeName === "createSlice") {
          info.hasStore = true;
        }

        // Processing React.memo/forwardRef (extract name from function argument)
        if (calleeName === "memo" || calleeName === "forwardRef") {
          const innerFn = path.node.arguments[0];
          if (innerFn && t.isFunction(innerFn) && (innerFn as any).id?.name) {
            const funcName = (innerFn as any).id.name;
            if (funcName.charAt(0) === funcName.charAt(0).toUpperCase()) {
              info.name = funcName;
            }
          }
        }
      }

      // Processing React.memo and forwardRef via MemberExpression (React.memo(...))
      if (t.isMemberExpression(path.node.callee) && 
          t.isIdentifier(path.node.callee.property) &&
          (path.node.callee.property.name === "memo" || path.node.callee.property.name === "forwardRef") &&
          t.isIdentifier(path.node.callee.object) &&
          path.node.callee.object.name === "React") {
        const innerFn = path.node.arguments[0];
        if (innerFn && t.isFunction(innerFn) && (innerFn as any).id?.name) {
          const funcName = (innerFn as any).id.name;
          if (funcName.charAt(0) === funcName.charAt(0).toUpperCase()) {
            info.name = funcName;
          }
        }
      }
    }
  });

  // Classify file based on extracted data
  info.fileType = classifyFile(info);

  return info;
}

/**
 * Determines file type based on extracted AST information.
 * Check order matters — more specific types are checked first.
 */
function classifyFile(info: ComponentInfo): FileType {
  // Component: has JSX and export
  if (info.jsxTree.length > 0 && info.exportsComponent) return "component";

  // Hook: name starts with "use" and has hooks (state/effects)
  if (info.name && info.name.startsWith("use") && (info.state.length > 0 || info.effects.length > 0)) {
    return "hook";
  }
  // Hook without state: name starts with "use" and is exported
  if (info.name && info.name.startsWith("use") && info.exportsComponent) {
    return "hook";
  }

  // Store: found state management (Zustand/Jotai/Redux)
  if (info.hasStore) return "store";

  // Context: found createContext
  if (info.hasContext) return "context";

  // Types: has prop interfaces but no functions or JSX
  if (info.props.length > 0 && !info.name && info.handlers.length === 0 && info.jsxTree.length === 0) {
    return "types";
  }

  // Util: has functions (name or handlers) but no JSX
  if ((info.name || info.handlers.length > 0) && info.jsxTree.length === 0) {
    return "util";
  }

  // Skip: nothing useful (barrel files, empty files, re-exports only)
  return "skip";
}

/**
 * Extracts variable name from an AST node
 * @param node - AST node
 * @returns Variable name or null
 */
function extractVariableName(node: t.Node | null): string | null {
  if (!node) return null;
  
  // Check array destructuring
  if (t.isArrayPattern(node)) {
    const firstElement = node.elements[0];
    if (t.isIdentifier(firstElement)) {
      return firstElement.name;
    }
  }
  
  return null;
}

/**
 * Extracts dependency array from an AST node
 * @param node - AST node with dependency array
 * @returns Array of dependency names
 */
function extractDependencies(node: t.Node | undefined): string[] {
  if (!node || !t.isArrayExpression(node)) {
    return [];
  }
  
  return node.elements
    .filter((element): element is t.Expression => element !== null)
    .map((element) => extractDependencyName(element))
    .filter((name): name is string => name !== null);
}

/**
 * Extracts dependency name from an expression
 * @param node - AST node with dependency expression
 * @returns String with dependency name
 */
function extractDependencyName(node: t.Expression): string | null {
  // Simple identifier
  if (t.isIdentifier(node)) {
    return node.name;
  }
  
  // Property access expression (e.g., data.length)
  if (t.isMemberExpression(node)) {
    const parts: string[] = [];
    let current: t.Expression = node;
    
    while (t.isMemberExpression(current)) {
      if (t.isIdentifier(current.property)) {
        parts.unshift(current.property.name);
      }
      current = current.object;
    }
    
    if (t.isIdentifier(current)) {
      parts.unshift(current.name);
    }
    
    return parts.join('.');
  }
  
  // Other expression types
  return null;
}

/**
 * Extracts type string from a TypeScript AST node
 * @param node - AST node with TypeScript type
 * @returns Type string
 */
function extractTypeString(node: t.TSType): string {
  // Primitive types
  if (t.isTSStringKeyword(node)) return 'string';
  if (t.isTSNumberKeyword(node)) return 'number';
  if (t.isTSBooleanKeyword(node)) return 'boolean';
  if (t.isTSAnyKeyword(node)) return 'any';
  if (t.isTSVoidKeyword(node)) return 'void';
  if (t.isTSNullKeyword(node)) return 'null';
  if (t.isTSUndefinedKeyword(node)) return 'undefined';
  
  // Union types
  if (t.isTSUnionType(node)) {
    return node.types.map(type => extractTypeString(type)).join(' | ');
  }
  
  // Array types
  if (t.isTSArrayType(node)) {
    return `${extractTypeString(node.elementType)}[]`;
  }
  
  // Function types
  if (t.isTSFunctionType(node)) {
    return 'function';
  }
  
  // Generic types
  if (t.isTSTypeReference(node)) {
    if (t.isIdentifier(node.typeName)) {
      return node.typeName.name;
    }
  }
  
  // Literal types
  if (t.isTSLiteralType(node)) {
    if (t.isStringLiteral(node.literal)) {
      return `"${node.literal.value}"`;
    }
    if (t.isNumericLiteral(node.literal)) {
      return `${node.literal.value}`;
    }
    if (t.isBooleanLiteral(node.literal)) {
      return `${node.literal.value}`;
    }
  }
  
  return 'unknown';
}