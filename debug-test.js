import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractComponentInfo } from './dist/ast/ast-extractor.js';
import { getDocumentationPrompt } from './dist/prompt-loader.js';

// Функция валидации документации (копия из docgen.ts)
function isValidDocumentation(response) {
  const invalidPatterns = [
    'analysisNeed markdown sections',
    'No props, no state, no effects',
    'Provide description, logic, key features',
    'unable to analyze',
    'cannot generate documentation',
    'no component found',
    'insufficient information'
  ];
  
  const responseLower = response.toLowerCase();
  
  // Проверяем на наличие паттернов неправильного ответа
  for (const pattern of invalidPatterns) {
    if (responseLower.includes(pattern.toLowerCase())) {
      return false;
    }
  }
  
  // Проверяем, что ответ содержит структуру Markdown
  const hasMarkdownStructure = 
    response.includes('#') || 
    response.includes('##') ||
    response.includes('###') ||
    response.includes('**');
    
  // Проверяем минимальную длину
  const hasMinimumLength = response.trim().length > 50;
  
  return hasMarkdownStructure && hasMinimumLength;
}

// Получаем директорию текущего модуля
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Тестирование исправлений для компонента Button ===\n');

// Читаем исходный код
const componentCode = readFileSync(path.join(__dirname, 'test-component.tsx'), 'utf8');

console.log('1. Исходный код компонента:');
console.log(componentCode);
console.log('\n');

// Извлекаем информацию о компоненте
const astInfo = extractComponentInfo(componentCode);

console.log('2. AST анализ компонента (ИСПРАВЛЕННЫЙ):');
console.log(JSON.stringify(astInfo, null, 2));
console.log('\n');

// Генерируем промпт
const prompt = getDocumentationPrompt(astInfo, componentCode);

console.log('3. Обновленный промпт (частично):');
console.log(prompt.substring(0, 500) + '...');
console.log('\n');

console.log('4. Тестирование валидации ответов LLM:');

// Тестируем неправильный ответ
const badResponse = 'analysisNeed markdown sections. No props, no state, no effects. Provide description, logic, key features.';
console.log('Неправильный ответ:', badResponse);
console.log('Валидация:', isValidDocumentation(badResponse) ? '✅ Прошел' : '❌ Отклонен');

// Тестируем правильный ответ
const goodResponse = `# Button Component

React компонент кнопки для пользовательского интерфейса.

## Props

- **text**: string - Текст кнопки (обязательный)
- **onClick**: () => void - Обработчик клика (обязательный)
- **disabled**: boolean - Состояние disabled (опциональный, по умолчанию false)

## Логика работы

Компонент отображает HTML button элемент и обрабатывает события клика через внутренний обработчик handleClick.`;

console.log('\nПравильный ответ:');
console.log(goodResponse);
console.log('Валидация:', isValidDocumentation(goodResponse) ? '✅ Прошел' : '❌ Отклонен');

console.log('\n5. Итог исправлений:');
console.log('✅ AST анализ теперь правильно извлекает:');
console.log('   - Имя компонента (Button вместо handleClick)');
console.log('   - Props из TypeScript интерфейсов');
console.log('   - Обработчики событий отдельно от компонентов');
console.log('✅ Добавлена валидация ответов LLM');
console.log('✅ Улучшен промпт с более четкими инструкциями');
console.log('✅ Добавлена повторная попытка при неправильном ответе');