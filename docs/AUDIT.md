# Аудит проекта react-docgen-ai

> **Дата:** 2026-06-19  
> **Ветка:** dev  
> **Последний коммит:** `51bceb9` — CLI verbose/quiet, scripts  
> **LOC:** ~2,900 строк TypeScript (+ ~1,100 тестов)

---

## 1. Архитектура проекта

### 1.1 Общая схема

```
bin/react-docgen-ai.js (entry point)
        │
        ▼
cli.ts (Commander — парсинг аргументов)
   │
   ├──► annotateProject/annotateInPlace() ── annotator.ts
   │         │
   │         ├──► processFilesConcurrent()  ── pipeline.ts
   │         ├──► extractComponentInfo()    ── ast/ast-extractor.ts
   │         ├──► toCompactAst()            ── ast/compact-format.ts
   │         ├──► getAnnotationPrompt()     ── prompt-loader.ts
   │         ├──► callLlm()                 ── llm.ts → llm-client.ts / opencode-provider.ts
   │         └──► writeOutput/InPlace()     ── file-utils.ts
   │
   ├──► generateDocs() ────── docgen.ts
   │         ├──► processFilesConcurrent()
   │         ├──► extractComponentInfo() + toCompactAst()
   │         ├──► getDocumentationPrompt()
   │         ├──► callLlm()
   │         └──► cleanupOrphanedDocs()
   │
   ├──► generateGraph() ───── generate-graph.ts
   │         └──► buildComponentGraph()   ── ast/component-graph.ts
   │
   └──► generateWiki() ────── wiki-generator.ts
             ├──► processFilesConcurrent()
             ├──► extractComponentInfo() + toCompactAst()
             ├──► getDocumentationPrompt()
             ├──► callLlm()
             ├──► buildGraphFromData()
             └──► updateIndex/updateLog/archivePages()
```

### 1.2 Технологический стек

| Слой | Технология |
|------|-----------|
| Язык | TypeScript 5.2+ (strict mode) |
| Сборка | tsc (TypeScript Compiler) |
| CLI | Commander 11 |
| LLM API | HTTP (fetch) + OpenCode SDK |
| AST | @babel/parser + @babel/traverse |
| Тесты | Bun test (bun:test) |
| Runtime | Bun 1.3+, Node 16+ ESM |

### 1.3 Ключевые зависимости

- **@babel/parser** — парсинг JSX/TypeScript
- **@babel/traverse** — обход AST
- **@babel/types** — AST-ноды
- **commander** — CLI
- **dotenv** — .env
- **@opencode-ai/sdk** — OpenCode провайдер

## 2. Текущее состояние

### 2.1 Реализованные фичи

- [x] AST-экстрактор (props, state, effects, handlers, jsxTree, exports)
- [x] File type detection (component/hook/context/store/util/types/skip)
- [x] Compact AST (текстовые сигнатуры вместо JSON, ~50-100 токенов)
- [x] Тип-специфичные промпты (6+1 файлов в `src/prompts/`)
- [x] Hash-based инкрементальность (SHA-256, первые 16 hex)
- [x] Skip-анализ для файлов без полезного содержимого
- [x] Аннотирование (с копированием и in-place)
- [x] Генерация Markdown/JSON документации
- [x] LLM Wiki (Obsidian-совместимая, index.md, log.md, entities/, _archive/)
- [x] Граф компонентов (DOT + Markdown)
- [x] Параллельная обработка (concurrent pipeline)
- [x] dry-run режим
- [x] OpenCode SDK провайдер
- [x] --verbose / --quiet флаги
- [x] disposeLlm() в finally

### 2.2 Тесты

- **98 тестов** (чистые функции, AST, pipeline) — `bun run test`
- **19 тестов** (mock-модули) — `bun run test:mock`
- **4 известных падения** (cross-contamination `mock.module` при групповом запуске)
- Всего: **117 тестов**, **0 падений** при раздельном запуске

### 2.3 Известные проблемы

1. **mock.module cross-contamination** — моки глобальны, тесты с `mock.module` нельзя запускать вместе с остальными. Решение: `test` и `test:mock` разделены.
2. **generate-graph.ts** — перечитывает файлы повторно (может использовать закэшированные данные)
3. **cleanupOrphanedDocs** — не принимает CliOptions (гейтинг verbose/quiet не распространяется)

## 3. Оптимизация токенов

Четырёхуровневая система:

| Уровень | Метод | Эффективность |
|---------|-------|---------------|
| 1. Skip | File type = "skip" | ~15% файлов |
| 2. Hash | SHA-256 сравнение | ~60% повторов |
| 3. Prompt | Тип-специфичные (15 строк vs 85) | ~82% на промпте |
| 4. AST | Компактные сигнатуры + авто-режим кода | ~80% на payload |

## 4. Структура тестов

| Тест | Тип | Кол-во | Зависимости |
|------|-----|--------|-------------|
| ast-extractor.test.ts | Чистые функции AST | 10 | — |
| compact-format.test.ts | Compact AST | 10 | — |
| component-graph.test.ts | Граф зависимостей | 7 | — |
| file-utils.test.ts | File I/O + hash | 20 | mock.module(fs) |
| prompt-loader.test.ts | Prompt загрузка | 13 | — |
| llm-client.test.ts | HTTP retry | 38 | mock.module |
| annotator.test.ts | Аннотирование | 10 | mock.module |
| docgen.test.ts | Генерация docs | 7 | mock.module |
| generate-graph.test.ts | Генерация графа | 2 | mock.module |

## 5. Рекомендации

1. **Изоляция mock-тестов** — текущее решение (раздельные команды) приемлемо, но можно переписать на временные файлы вместо `mock.module`
2. **generate-graph.ts** — добавить опциональное кэширование FileInfo[]
3. **cleanupOrphanedDocs** — передавать CliOptions для единообразного логирования
4. **AUDIT.md** — авто-генерировать из package.json (version, deps)
5. **CI** — добавить GitHub Actions: typecheck → test → test:mock

---

*Последнее обновление: 2026-06-19*
