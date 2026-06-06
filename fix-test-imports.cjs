const fs = require('fs');
const path = require('path');

// Список файлов для обновления
const testFiles = [
  '__tests__/llm-client.test.ts',
  '__tests__/component-graph.test.ts',
  '__tests__/prompt-loader.test.ts',
  '__tests__/docgen.test.ts',
  '__tests__/annotator.test.ts',
  '__tests__/generate-graph.test.ts'
];

// Функция замены импортов
function updateImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Заменяем импорты из src на dist
  content = content.replace(/from ['"]\.\.\/src\//g, "from '../dist/");
  
  fs.writeFileSync(filePath, content);
  console.log(`Updated imports in ${filePath}`);
}

// Обновляем все тестовые файлы
testFiles.forEach(file => {
  if (fs.existsSync(file)) {
    updateImports(file);
  } else {
    console.log(`File not found: ${file}`);
  }
});

console.log('All imports updated!');