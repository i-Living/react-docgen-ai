/**
 * @fileoverview Экстрактор информации о React компонентах из AST
 * @author AI Docgen  
 * @version 1.0.0
 */

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import { NodePath } from "@babel/traverse"
import * as t from "@babel/types";
import { ComponentInfo } from "../types.js";

/**
 * Извлекает структурную информацию о React компоненте из исходного кода
 * @param code - Исходный код React компонента
 * @returns Объект с информацией о компоненте
 */
export function extractComponentInfo(code: string): ComponentInfo {
  // Парсим код в AST с поддержкой JSX и TypeScript
  const ast = parse(code, {
    sourceType: "module" as const,
    plugins: ["jsx", "typescript"]
  });

  // Инициализируем структуру для хранения информации о компоненте
  const info: ComponentInfo = {
    name: null,
    props: [],
    state: [],
    effects: [],
    handlers: [],
    jsxTree: [],
    exportsComponent: false
  };
  const traverse = typeof _traverse === "function" ? _traverse : ((_traverse as any).default as typeof _traverse)

  // Обходим AST дерево для извлечения информации
  traverse(ast, {
    // Проверяем экспорт по умолчанию
    ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
      info.exportsComponent = true;
      
      // Если экспортируется декларация функции
      if (t.isFunctionDeclaration(path.node.declaration) && path.node.declaration.id) {
        info.name = path.node.declaration.id.name;
      }
    },

    // Извлекаем имя функции-компонента
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      if (path.node.id) {
        const funcName = path.node.id.name;
        
        // Если имя начинается с заглавной буквы, это компонент
        if (funcName.charAt(0) === funcName.charAt(0).toUpperCase()) {
          if (!info.name) {
            info.name = funcName;
          }
        } else {
          // Это обработчик события
          info.handlers.push({
            name: funcName
          });
        }
      }
    },

    // Обрабатываем переменные с функциями (стрелочные и обычные)
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (
        path.node.init &&
        (path.node.init.type === "ArrowFunctionExpression" ||
         path.node.init.type === "FunctionExpression")
      ) {
        if (t.isIdentifier(path.node.id)) {
          const funcName = path.node.id.name;
          
          // Если имя начинается с заглавной буквы, это компонент
          if (funcName.charAt(0) === funcName.charAt(0).toUpperCase()) {
            if (!info.name) {
              info.name = funcName;
            }
          } else {
            // Это обработчик события
            info.handlers.push({
              name: funcName
            });
          }
        }
      }
    },

    // Анализируем JSX элементы
    JSXElement(path: NodePath<t.JSXElement>) {
      const opening = path.node.openingElement;
      
      // Извлекаем имя компонента из opening tag
      if (t.isJSXIdentifier(opening.name)) {
        info.jsxTree.push(opening.name.name);
      }
    },

    // Извлекаем TypeScript интерфейсы для пропсов
    TSInterfaceDeclaration(path: NodePath<t.TSInterfaceDeclaration>) {
      const interfaceName = path.node.id.name;
      
      // Ищем интерфейсы, которые могут быть пропсами компонента
      if (interfaceName.endsWith('Props') || interfaceName === 'Props') {
        // Извлекаем свойства интерфейса
        for (const property of path.node.body.body) {
          if (t.isTSPropertySignature(property) && t.isIdentifier(property.key)) {
            const propName = property.key.name;
            let propType = 'any';
            
            // Извлекаем тип свойства
            if (property.typeAnnotation && t.isTSTypeAnnotation(property.typeAnnotation)) {
              propType = extractTypeString(property.typeAnnotation.typeAnnotation);
            }
            
            // Извлекаем значение по умолчанию (если есть)
            let defaultValue = undefined;
            if (property.typeAnnotation && t.isTSTypeAnnotation(property.typeAnnotation)) {
              const tsType = property.typeAnnotation.typeAnnotation;
              if (t.isTSUnionType(tsType)) {
                // Проверяем литеральные типы для значений по умолчанию
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

    // Обрабатываем React хуки и вспомогательные вызовы
    CallExpression(path: NodePath<t.CallExpression>) {
      // Проверяем вызовы функций по имени
      if (t.isIdentifier(path.node.callee)) {
        const calleeName = path.node.callee.name;

        // Обработка useState хуков
        if (calleeName === "useState") {
          // Ищем переменную дескриптор с деструктуризацией в родительских узлах
          let variablePath = path.findParent((p) => t.isVariableDeclarator(p.node));
          
          if (variablePath && t.isVariableDeclarator(variablePath.node)) {
            // Извлекаем имя переменной состояния из деструктуризации
            const variableName = extractVariableName(variablePath.node.id);
            info.state.push({
              variable: variableName || "state"
            });
          }
        }

        // Обработка useEffect хуков
        if (calleeName === "useEffect") {
          // Извлекаем зависимости из второго аргумента
          const deps = extractDependencies(path.node.arguments[1]);
          info.effects.push({
            deps: deps
          });
        }

        // Обработка React.memo/forwardRef (извлекаем имя из аргумента функции)
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

      // Обработка React.memo и forwardRef через MemberExpression (React.memo(...))
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

  return info;
}

/**
 * Извлекает имя переменной из узла AST
 * @param node - Узел AST
 * @returns Имя переменной или null
 */
function extractVariableName(node: t.Node | null): string | null {
  if (!node) return null;
  
  // Проверяем деструктуризацию массива
  if (t.isArrayPattern(node)) {
    const firstElement = node.elements[0];
    if (t.isIdentifier(firstElement)) {
      return firstElement.name;
    }
  }
  
  return null;
}

/**
 * Извлекает массив зависимостей из узла AST
 * @param node - Узел AST с массивом зависимостей
 * @returns Массив имен зависимостей
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
 * Извлекает имя зависимости из выражения
 * @param node - Узел AST с выражением зависимости
 * @returns Строка с именем зависимости
 */
function extractDependencyName(node: t.Expression): string | null {
  // Простой идентификатор
  if (t.isIdentifier(node)) {
    return node.name;
  }
  
  // Выражение доступа к свойству (например, data.length)
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
  
  // Другие типы выражений
  return null;
}

/**
 * Извлекает строку типов из узла AST TypeScript
 * @param node - Узел AST с TypeScript типом
 * @returns Строка с типом
 */
function extractTypeString(node: t.TSType): string {
  // Примитивные типы
  if (t.isTSStringKeyword(node)) return 'string';
  if (t.isTSNumberKeyword(node)) return 'number';
  if (t.isTSBooleanKeyword(node)) return 'boolean';
  if (t.isTSAnyKeyword(node)) return 'any';
  if (t.isTSVoidKeyword(node)) return 'void';
  if (t.isTSNullKeyword(node)) return 'null';
  if (t.isTSUndefinedKeyword(node)) return 'undefined';
  
  // Типы объединения
  if (t.isTSUnionType(node)) {
    return node.types.map(type => extractTypeString(type)).join(' | ');
  }
  
  // Типы массива
  if (t.isTSArrayType(node)) {
    return `${extractTypeString(node.elementType)}[]`;
  }
  
  // Функциональные типы
  if (t.isTSFunctionType(node)) {
    return 'function';
  }
  
  // Обобщенные типы
  if (t.isTSTypeReference(node)) {
    if (t.isIdentifier(node.typeName)) {
      return node.typeName.name;
    }
  }
  
  // Литеральные типы
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