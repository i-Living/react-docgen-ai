# React Docgen AI

Продвинутый CLI инструмент для автоматического документирования и аннотирования React проектов с использованием LLM.

## ✨ Возможности

- **AST-анализ** — глубокий анализ React компонентов (JSX, state, effects, handlers, props, дерево компонентов)
- **Интеграция с LLM** — работа с локальными моделями (HTTP API) и облачными через OpenCode SDK
- **Автоматическое аннотирование** — добавление JSDoc комментариев (с копированием или in-place)
- **Генерация документации** — Markdown или JSON документация с hash-based инкрементальностью
- **LLM Wiki** — Obsidian-совместимая wiki с `[[wikilinks]]`, YAML frontmatter и log.md
- **Граф компонентов** — визуализация зависимостей в форматах DOT и Markdown
- **Оптимизация токенов** — компактный AST, тип-специфичные промпты, skip-анализ, hash-кэширование
- **TypeScript** — полностью типизированный код

## 🚀 Установка

```bash
# Требования: Bun >= 1.3, Node.js 16+
bun install
bun run build
```

## 🎯 Использование

```bash
# Аннотирование кода
bun run start -- --src ./src --annotate

# Генерация документации
bun run start -- --src ./src --docs

# Граф компонентов
bun run start -- --src ./src --graph

# LLM Wiki (Obsidian-совместимая)
bun run start -- --src ./src --wiki
```

## ⚙️ Полный список опций

| Опция | Описание | По умолчанию |
|-------|----------|--------------|
| `--src, -s` | Путь к исходной директории или файлу | **Обязательно** |
| `--out, -o` | Выходная директория | `./ai-output` |
| `--annotate` | Аннотирование с копированием | `false` |
| `--annotate-inplace` | Аннотирование in-place | `false` |
| `--docs` | Генерация документации | `false` |
| `--graph` | Генерация графа компонентов | `false` |
| `--wiki [path]` | Генерация LLM Wiki | env или — |
| `--extensions, -e` | Расширения файлов | `js,jsx,ts,tsx` |
| `--api` | URL LLM API | `http://localhost:8000/completions` |
| `--opencode` | Использовать OpenCode SDK | `false` |
| `--opencode-model` | Модель OpenCode (provider/model) | из профиля |
| `--max-tokens` | Максимум токенов для LLM | `4096` |
| `--temperature` | Температура LLM | `0.1` |
| `--parallel` | Параллельных запросов к LLM | `4` |
| `--format` | Формат документации: `markdown`, `json` | `markdown` |
| `--force` | Перезапись существующих файлов | `false` |
| `--dry-run` | Сухой прогон (без LLM и записи) | `false` |
| `--verbose` | Подробный вывод | `false` |
| `--quiet` | Тихий режим (только ошибки) | `false` |
| `--stream` | Streaming для HTTP провайдера | `false` |
| `--prompt-dir` | Кастомные файлы промптов | встроенные |

### Конфигурация через .env

| Переменная | Аналог CLI | По умолчанию |
|------------|-----------|--------------|
| `LLM_API_URL` | `--api` | `http://localhost:8000/completions` |
| `LLM_MAX_TOKENS` | `--max-tokens` | `4096` |
| `LLM_TEMPERATURE` | `--temperature` | `0.1` |
| `LLM_API_MODEL` | `--opencode-model` | `deepseek-v4-flash` |
| `DOCGEN_OUT` | `--out` | `./ai-output` |
| `DOCGEN_EXTENSIONS` | `--extensions` | `js,jsx,ts,tsx` |
| `DOCGEN_WIKI` | `--wiki` | — |
| `DOCGEN_PARALLEL` | `--parallel` | `4` |

## 📖 LLM Wiki

Режим `--wiki` создаёт Obsidian-совместимую документацию в стиле [Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):

```
wiki/
├── index.md           # Каталог всех компонентов
├── log.md             # История изменений
├── entities/          # Страницы компонентов
│   ├── button.md
│   └── header.md
└── _archive/          # Архивированные страницы
```

**Фичи:**
- Персистентность — при повторном запуске обновляется только изменившееся (hash-based)
- `[[wikilinks]]` на основе графа зависимостей
- YAML frontmatter (title, created, updated, tags, source, confidence, hash)
- Archiving — при удалении файла страница уходит в `_archive/`
- История изменений в `log.md`

## 🧠 Оптимизация токенов

Четырёхуровневая система минимизации затрат LLM:

1. **Skip-анализ** — файлы без полезного содержимого (чистые типы, пустые утилиты) пропускаются до вызова LLM
2. **Hash-инкрементальность** — SHA-256 хэш содержимого файла; при совпадении с предыдущим запуском — переиспользование документации без LLM
3. **Тип-специфичные промпты** — для каждого типа файла (component, hook, context, store, util, types) — отдельный краткий промпт (вместо универсального 85-строчного)
4. **Компактный AST** — текстовая сигнатура вместо `JSON.stringify` (50–100 токенов вместо 600–800); автовыбор: ≤100 строк → только сигнатуры, >100 строк → сигнатуры + код

**Эффект:** ~80% экономии на payload и ~82% на промпте.

## 🔧 Разработка

### Скрипты

| Команда | Описание |
|---------|----------|
| `bun run build` | Компиляция TypeScript |
| `bun run dev` | Автопересборка |
| `bun run start` | Запуск |
| `bun run test` | Основные тесты (без mock) |
| `bun run test:mock` | Тесты с mock-модулями |
| `bun run test:all` | Все тесты |
| `bun run typecheck` | Проверка типов |
| `bun run clean` | Очистка dist |

### Структура проекта

```
src/
├── cli.ts                 # Командная строка
├── types.ts               # Типы и интерфейсы
├── llm.ts                 # Фасад LLM (HTTP / OpenCode)
├── llm-client.ts          # HTTP клиент с retry
├── opencode-provider.ts   # Провайдер OpenCode
├── prompt-loader.ts       # Загрузка тип-специфичных промптов
├── pipeline.ts            # Параллельный пайплайн
├── progress.ts            # Прогресс-бар
├── annotator.ts           # Аннотирование
├── docgen.ts              # Генерация документации
├── wiki-generator.ts      # Генератор LLM Wiki
├── generate-graph.ts      # Граф компонентов
├── file-utils.ts          # Утилиты файлов + SHA-256 хэш
├── env.ts                 # .env загрузка
├── ast/
│   ├── ast-extractor.ts   # AST экстрактор + file type detection
│   ├── compact-format.ts  # Компактный AST формат
│   └── component-graph.ts # Граф зависимостей
└── prompts/               # Тип-специфичные промпты
    ├── annotation.txt
    ├── component.txt
    ├── hook.txt
    ├── context.txt
    ├── store.txt
    ├── util.txt
    └── types.txt
```

## 🧪 Тестирование

Проект использует **Bun test** (единый раннер, без Jest).

```bash
# Основные 98 тестов (чистые функции, AST, pipeline)
bun run test

# Mock-тесты (изолированы из-за mock.module)
bun run test:mock

# Все 117 тестов
bun run test:all
```

## 🤝 Вклад

Приветствуются PR и issues!
