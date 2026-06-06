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

// Функция для очистки ответа LLM (копия из llm-client.ts)
function cleanLLMResponse(response) {
  let cleaned = response;
  
  // Удаляем markdown блоки кода в начале
  cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/g, '');
  cleaned = cleaned.replace(/^```\n?/g, '');
  
  // Удаляем markdown блоки кода в конце
  cleaned = cleaned.replace(/\n?```$/g, '');
  
  // Удаляем лишние переносы строк в начале и конце
  cleaned = cleaned.trim();
  
  // Удаляем дублированные переносы строк внутри текста
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  return cleaned;
}

// Мок функции LLM для тестирования
async function mockCallLLM(api, prompt) {
  console.log('📡 Mock LLM API called');
  console.log('🔍 Checking if prompt contains proper AST data...');
  
  if (prompt.includes('"name": "Button"') && prompt.includes('"props":')) {
    console.log('✅ AST data found in prompt');
    return `Проблемный ответ: analysisNeed markdown sections. No props, no state, no effects. Provide description, logic, key features.`;
  } else {
    console.log('❌ AST data missing in prompt');
    return 'analysisNeed markdown sections. No props, no state, no effects. Provide description, logic, key features.';
  }
}

// Имитация работы генерации документации
async function testDocgenSimulation() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  console.log('=== Тестирование исправленного модуля документирования ===\n');
  
  // Читаем тестовый компонент
  const componentCode = readFileSync(path.join(__dirname, 'test-component.tsx'), 'utf8');
  
  // Извлекаем AST информацию
  const astInfo = extractComponentInfo(componentCode);
  console.log('1. AST анализ (ИСПРАВЛЕННЫЙ):');
  console.log(`   - Имя компонента: ${astInfo.name}`);
  console.log(`   - Количество пропсов: ${astInfo.props.length}`);
  console.log(`   - Обработчики: ${astInfo.handlers.map(h => h.name).join(', ')}`);
  console.log();
  
  // Генерируем промпт
  const prompt = getDocumentationPrompt(astInfo, componentCode);
  
  // Симулируем первый вызов LLM
  console.log('2. Первый вызов LLM:');
  let doc = await mockCallLLM('http://localhost:8000/completions', prompt);
  doc = cleanLLMResponse(doc);
  console.log('   Полученный ответ:', doc.substring(0, 100) + '...');
  
  // Проверяем валидацию
  const isValid = isValidDocumentation(doc);
  console.log(`   Валидация: ${isValid ? '✅ Прошел' : '❌ Отклонен'}`);
  console.log();
  
  if (!isValid) {
    console.log('3. Вторая попытка с более строгим промптом:');
    const strictPrompt = prompt + "\n\nКРИТИЧЕСКИ ВАЖНО: Создай полную Markdown документацию. НЕ пиши сообщения об ошибках. НЕ проси дополнительную информацию. ИСПОЛЬЗУЙ данные из AST!";
    
    doc = await mockCallLLM('http://localhost:8000/completions', strictPrompt);
    doc = cleanLLMResponse(doc);
    console.log('   Полученный ответ:', doc.substring(0, 100) + '...');
    
    const isValidAfterRetry = isValidDocumentation(doc);
    console.log(`   Валидация после повторной попытки: ${isValidAfterRetry ? '✅ Прошел' : '❌ Отклонен'}`);
  }
  
  console.log('\n4. ИТОГ:');
  if (isValid) {
    console.log('✅ Проблема С РЕШЕНА! Модуль документирования работает правильно.');
    console.log('✅ AST анализ корректно извлекает информацию о компонентах');
    console.log('✅ Валидация отфильтровывает неправильные ответы LLM');
    console.log('✅ Промпт содержит четкие инструкции для LLM');
  } else {
    console.log('❌ Проблема все еще существует');
  }
}

testDocgenSimulation().catch(console.error);