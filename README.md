# React Docgen AI

Продвинутый CLI инструмент для автоматического документирования и аннотирования React проектов с использованием локального LLM.

## ✨ Возможности

- **AST-анализ** - глубокий анализ структуры React компонентов (JSX, state, effects, handlers, дерево компонентов)
- **Интеграция с LLM** - работа с локальными LLM моделями (gpt-oss-20b и совместимыми)
- **Автоматическое аннотирование** - добавление подробных JSDoc комментариев к коду
- **Генерация документации** - создание подробной Markdown документации
- **Генерация графа компонентов** - визуализация зависимостей в форматах DOT и Markdown
- **TypeScript поддержка** - полностью типизированный код с поддержкой современного JavaScript

## 🚀 Установка и настройка

### Требования
- [Bun](https://bun.sh) >= 1.3
- Node.js 16+ (для runtime)
- Локальный LLM сервер (например, запущенный на localhost:8000)

### Установка зависимостей
```bash
bun install
```

### Компиляция TypeScript
```bash
bun run build
```

### Разработка с автопересборкой
```bash
bun run dev
```

## 🎯 Примеры использования

### 1. Автоматическое аннотирование кода
Добавляет подробные JSDoc комментарии к React компонентам:
```bash
# Обработка директории
npx react-docgen-ai --src ./src --annotate --out ./annotated

# Обработка отдельного файла
npx react-docgen-ai --src ./src/components/Button.tsx --annotate --out ./annotated
```

### 2. Аннотирование in-place
Добавляет аннотации непосредственно в исходные файлы (без создания копий):
```bash
# Обработка директории
npx react-docgen-ai --src ./src --annotate-inplace

# Обработка отдельного файла
npx react-docgen-ai --src ./src/components/Button.tsx --annotate-inplace
```

> **Примечание:** Файлы с тегом `@fileoverview` пропускаются по умолчанию. Используйте `--force` для их обработки:
> ```bash
> npx react-docgen-ai --src ./src --annotate-inplace --force
> ```

### 3. Генерация документации
Создает подробную Markdown документацию:
```bash
# Обработка директории
npx react-docgen-ai --src ./src --docs --out ./docs

# Обработка отдельного файла
npx react-docgen-ai --src ./src/components/Button.tsx --docs --out ./docs
```

> **Примечание:** Файлы документации, для которых уже существует `.md` файл в выходной директории, пропускаются по умолчанию. Используйте `--force` для их перезаписи:
> ```bash
> npx react-docgen-ai --src ./src --docs --force
> ```
> 
> При запуске также автоматически удаляются устаревшие файлы документации (для которых нет соответствующих исходных файлов).

### 4. Генерация графа компонентов
Создает визуализацию зависимостей компонентов:
```bash
# Обработка директории
npx react-docgen-ai --src ./src --graph --out ./graphs

# Обработка отдельного файла
npx react-docgen-ai --src ./src/components/Button.tsx --graph --out ./graphs
```

### 5. Полная обработка проекта
Выполняет все операции одновременно:
```bash
npx react-docgen-ai --src ./src --annotate --docs --graph --out ./output
```

### 6. Поддержка разных форматов файлов
По умолчанию обрабатываются файлы с расширениями `js,jsx,ts,tsx`:
```bash
# Только TypeScript файлы
npx react-docgen-ai --src ./src --annotate --extensions ts,tsx

# Только JavaScript файлы
npx react-docgen-ai --src ./src --annotate --extensions js,jsx
```

## ⚙️ Настройка LLM

### Запуск локального LLM сервера
```bash
# Пример с gpt-oss-20b
python server.py --model_path ./gpt-oss-20b --port 8000
```

### Настройка API URL
```bash
npx react-docgen-ai --src ./src --annotate --api http://localhost:8000/completions
```

## 📚 API Reference

### Опции командной строки

| Опция | Описание | По умолчанию |
|-------|----------|--------------|
| `--src, -s` | Путь к исходной директории или отдельному файлу | **Обязательно** |
| `--out, -o` | Выходная директория | `./ai-output` |
| `--annotate` | Включить аннотирование кода | `false` |
| `--annotate-inplace` | Аннотировать непосредственно в исходных файлах | `false` |
| `--force` | Принудительно обрабатывать файлы (игнорировать @fileoverview для аннотирования, перезаписывать существующую документацию) | `false` |
| `--docs` | Включить генерацию документации | `false` |
| `--graph` | Включить генерацию графа | `false` |
| `--extensions, -e` | Расширения файлов (только для директорий) | `js,jsx,ts,tsx` |
| `--api` | URL LLM API | `http://localhost:8000/completions` |
| `--max-tokens` | Максимальное количество токенов | `4096` |
| `--temperature` | Температура генерации LLM | `0.1` |

> **Примечание:** При указании отдельного файла через `--src`, параметр `--extensions` игнорируется. Файл должен иметь одно из расширений: `js, jsx, ts, tsx`. При указании директории обрабатываются все файлы с указанными расширениями рекурсивно.

### Структура выходных файлов

```
ai-output/
├── annotated/          # Аннотированный код
│   └── src/
│       └── components/
├── docs/              # Markdown документация
│   └── src/
│       └── components/
└── graph/             # Граф компонентов
    ├── components.dot
    └── components.md
```

## 🔧 Сборка и разработка

### Доступные скрипты
- `bun run build` - компиляция TypeScript в JavaScript
- `bun run dev` - разработка с автопересборкой
- `bun run start` - запуск скомпилированного кода
- `bun run clean` - очистка директории dist

### Структура проекта
```
react-docgen-ai/
├── src/
│   ├── types.ts              # TypeScript типы и интерфейсы
│   ├── cli.ts                # Командная строка
│   ├── annotator.ts          # Модуль аннотирования
│   ├── docgen.ts             # Генератор документации
│   ├── generate-graph.ts     # Построитель графа
│   ├── file-utils.ts         # Утилиты файлов
│   ├── llm-client.ts         # Клиент LLM
│   └── ast/                  # AST анализ
│       ├── ast-extractor.ts  # Экстрактор компонентов
│       └── component-graph.ts # Граф зависимостей
├── bin/
│   └── react-docgen-ai.js    # Entry point
├── dist/                     # Скомпилированный JS
├── tsconfig.json             # TypeScript конфигурация
└── package.json              # NPM конфигурация
```

## 🤖 Возможности AST анализа

- **Извлечение компонентов** - автоматическое определение React компонентов
- **Анализ props** - типы и значения по умолчанию
- **State анализ** - хуки useState и их инициализация
- **Effect анализ** - useEffect и зависимости
- **JSX дерево** - структура вложенных компонентов
- **Экспорт detection** - определение экспортируемых компонентов

## 📈 Генерация графа

### DOT формат
Генерирует файл `components.dot` для визуализации в Graphviz:
```bash
# Создание PNG изображения
dot -Tpng components.dot -o components.png

# Создание SVG
dot -Tsvg components.dot -o components.svg

# Создание PDF
dot -Tpdf components.dot -o components.pdf
```

### Markdown формат
Создает читаемое дерево компонентов в Markdown с подробным описанием.

## 🛠️ Технические детали

### TypeScript особенности
- Полная типизация всех модулей
- Строгий режим TypeScript
- Генерация деклараций (.d.ts)
- Source maps для отладки

### Поддерживаемые технологии
- React (JSX/TSX)
- Babel AST parser
- Современный ES модули
- Node.js ESM

## 🔍 Troubleshooting

### Частые проблемы

**LLM API недоступен**
```
❌ Ошибка: LLM API error: connect ECONNREFUSED
```
**Решение:** Убедитесь, что LLM сервер запущен и доступен по указанному URL.

**TypeScript ошибки**
```
❌ Cannot find module 'globby'
```
**Решение:** Установите зависимости командой `bun install`.

**Права доступа**
```
❌ Error: EACCES: permission denied
```
**Решение:** Проверьте права доступа к директориям или запустите с правами администратора.

## 📄 Лицензия

MIT License

## 🤝 Вклад в проект

Приветствуются pull requests и issue reports!

---

**Создано с ❤️ для улучшения документирования React проектов**