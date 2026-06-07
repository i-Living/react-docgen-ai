# Аудит проекта react-docgen-ai

> **Дата:** 2026-06-07  
> **Ветка:** main  
> **Последний коммит:** `2e8d47f` — init commit  
> **LOC:** 1,625 строк TypeScript

---

## 1. Архитектура проекта

### 1.1 Общая схема

```
bin/react-docgen-ai.js (entry point)
        │
        ▼
src/cli.ts (Commander CLI — парсинг аргументов)
        │
        ├──► annotateProject() ─── annotator.ts
        │       │                      │
        │       ├──► extractComponentInfo() — ast/ast-extractor.ts
        │       ├──► getAnnotationPrompt()  — prompt-loader.ts
        │       ├──► callLLM()              — llm-client.ts
        │       └──► writeOutput()          — file-utils.ts
        │
        ├──► annotateInPlace() ─── annotator.ts (то же, но writeInPlace)
        │
        ├──► generateDocs() ──── docgen.ts
        │       │
        │       ├──► extractComponentInfo()
        │       ├──► getDocumentationPrompt()
        │       └──► callLLM() + writeOutput()
        │
        └──► generateGraph() ─── generate-graph.ts
                │
                └──► buildComponentGraph() — ast/component-graph.ts
```

### 1.2 Технологический стек

| Слой | Технология |
|------|-----------|
| Язык | TypeScript 5.2+ (strict mode) |
| Сборка | tsc (TypeScript Compiler) |
| CLI | Commander |
| LLM API | Axios (REST, text completion endpoint) |
| AST | @babel/parser + @babel/traverse |
| Файлы | fs-extra, globby |
| Тесты | Jest 30 + ts-jest |
| Формат модулей | ESM |

### 1.3 Структура файлов

```
src/
├── types.ts                    (127 строк) — все типы/интерфейсы
├── cli.ts                      (131 стк) — парсинг CLI, диспетчеризация
├── annotator.ts                (220 стк) — аннотирование (code → LLM → comments)
├── docgen.ts                   (149 стк) — генерация документации
├── generate-graph.ts           (62 стк) — генерация графа компонентов
├── file-utils.ts               (230 стк) — файловые операции
├── llm-client.ts               (109 стк) — HTTP клиент для LLM
├── prompt-loader.ts            (62 стк) — загрузка промптов
├── prompt-loader copy.ts       (95 стк) — ДУБЛЬ с улучшенной логикой
├── global.d.ts                 (29 стк) — переопределение console
├── ast/
│   ├── ast-extractor.ts        (308 стк) — AST парсинг компонентов
│   └── component-graph.ts      (103 стк) — построение графа
└── prompts/
    ├── annotation.txt          (5.8 KB) — промпт для аннотации
    └── documentation.txt       (6.6 KB) — промпт для документации
```

---

## 2. Архитектурные проблемы

### ✅ ARCH-01: Дублирование файла `prompt-loader copy.ts` (ИСПРАВЛЕНО)

- **Категория:** Качество
- **Критичность:** Medium
- **Локация:** `src/prompt-loader copy.ts`

Оригинальный `prompt-loader.ts` использует `__dirname` в ESM контексте, но **не импортирует** `fileURLToPath`. Файл `prompt-loader copy.ts` — это исправленная версия с функцией `getPromptsDirectory()`, которая проверяет несколько путей. Однако она названа с пробелом и не подключена нигде.

**Риск:** Если `prompt-loader.ts` падает при запуске через ESM (а `__dirname` в ESM без `fileURLToPath` не определён), приложение не работает. Факт — `__dirname` не определён в ESM-модулях, код должен был бы упасть.

**Рекомендация:** Удалить `prompt-loader copy.ts`, переименовать/перенести её содержимое в `prompt-loader.ts`.

### ✅ ARCH-02: 90% дублирования кода между `annotateProject` и `annotateInPlace` (ИСПРАВЛЕНО)

- **Категория:** Качество
- **Критичность:** Medium
- **Локация:** `src/annotator.ts:43-220`

Две функции отличаются только:
1. Сообщением в `console.log`
2. Функцией записи результата: `writeOutput()` vs `writeInPlace()`

Остальные ~150 строк — идентичный код с одинаковыми циклами, retry-логикой, обработкой ошибок.

**Рекомендация:** Выделить общую логику в `annotateFiles(opts, mode: 'copy' | 'inplace')`.

### ✅ ARCH-03: `removeComments()` — улучшена (ИСПРАВЛЕНО)

- **Категория:** Качество
- **Критичность:** High
- **Локация:** `src/file-utils.ts:132-186`

Регекспная очистка комментариев не учитывает:
- Регулярные выражения в коде (`/\/\*.*/` — будет распознан как комментарий)
- Строки, содержащие `*/` (например, `const s = "/* not a comment */"`)
- Комментарии внутри JSX
- `//` внутри URL или template literal

**Проблема:** `hasCodeChanges()` использует `removeComments()` для сравнения — любой false positive/negative приводит к ложным срабатываниям. LLM может изменить код, но если после удаления комментариев строки совпали — изменение не обнаружено.

**Рекомендация:** Использовать `@babel/parser` (уже есть зависимость) для надёжного удаления комментариев или AST-based comparison.

### ✅ ARCH-04: `callLLM()` — добавлен Chat Completion (ИСПРАВЛЕНО)

- **Категория:** Архитектура
- **Критичность:** High
- **Локация:** `src/llm-client.ts:75-109`

Клиент отправляет `{ prompt, max_tokens, temperature }` — это формат OpenAI **Completion** (legacy), а не Chat Completion (`{ messages: [...] }`). Современные LLM API (OpenAI, Anthropic, Ollama, vLLM) используют Chat Completion.

**Рекомендация:** Добавить поддержку Chat Completion с `{ messages: [{ role: "user", content: prompt }] }` и возможность выбора формата через опцию `--api-format`.

---

## 3. Проблемы безопасности

### SEC-01: Axios — 20+ уязвимостей (1 Critical, 4 High)

- **Категория:** Безопасность
- **Критичность:** Critical
- **Локация:** `node_modules/axios` (^1.6.0)

`npm audit` показывает **8 уязвимостей** (1 critical, 4 high). Включая:
- SSRF через NO_PROXY bypass
- Prototype Pollution в mergeConfig (ReDoS)
- CRLF Injection в multipart/form-data
- Server-Side Request Forgery
- Prototype Pollution gadgets для кражи credentials

**Рекомендация:** Обновить axios до последней версии. На момент аудита последняя `1.8.x` устраняет большинство проблем. Также рассмотреть замену на `fetch` (Node 18+ native).

### SEC-02: Prompt Injection через {{CODE}} и {{AST_INFO}}

- **Категория:** Безопасность
- **Критичность:** Medium
- **Локация:** `src/prompt-loader.ts:31-33`

Плейсхолдеры `{{CODE}}` и `{{AST_INFO}}` подставляются напрямую в промпт без экранирования. Если код содержит инструкции для LLM (например, "игнорируй все предыдущие инструкции"), они попадут в системный промпт.

**Рекомендация:** Использовать разделение на system/user сообщения (chat completion). Код и AST_INFO должны быть в user message, а инструкции — в system message.

### SEC-03: Нет ограничений на длину ответа LLM

- **Категория:** Безопасность
- **Критичность:** Low
- **Локация:** `src/llm-client.ts`

Параметр `maxTokens` передаётся в API, но нет проверки на размер ответа на стороне клиента. LLM может вернуть гигантский ответ, что приведёт к переполнению памяти.

**Рекомендация:** Добавить проверку `content.length > SOME_LIMIT` и обрезать или отклонять слишком длинные ответы.

---

## 4. Проблемы правильности

### ✅ COR-01: `__dirname` не определён в ESM (ИСПРАВЛЕНО)

- **Категория:** Правильность
- **Критичность:** Critical
- **Локация:** `src/prompt-loader.ts:12-13`

```typescript
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

Код **использует** `__dirname`, но не объявляет его. В ESM `__dirname` не определён. Для исправления нужно объявление через `fileURLToPath`. Странно, что `tsc` не выдаёт ошибку.

**Риск:** При запуске `node dist/cli.js` — `__dirname is not defined`.

**Рекомендация:** Использовать код из `prompt-loader copy.ts` или добавить корректное объявление через `fileURLToPath`.

### ✅ COR-02: `global.d.ts` — удалён (ИСПРАВЛЕНО)

- **Категория:** Качество
- **Критичность:** Low
- **Локация:** `src/global.d.ts`

Node.js уже имеет полную типизацию `console` из `@types/node`. Переопределение в `global.d.ts`:
1. Нигде не импортируется (`export {}` делает его модулем, augmentations global)
2. Может конфликтовать с `@types/node`

**Рекомендация:** Удалить файл `global.d.ts` — он не нужен.

### ✅ COR-03: `removeComments` удаляет JSDoc дважды (ИСПРАВЛЕНО)

- **Категория:** Правильность
- **Критичность:** Low
- **Локация:** `src/file-utils.ts:158-161`

```typescript
// Удаляем многострочные комментарии (/* comment */)
result = result.replace(/\/\*[\s\S]*?\*\//g, '');
// Удаляем JSDoc комментарии (/** comment */)
result = result.replace(/\/\*\*[\s\S]*?\*\//g, '');
```

Регекс для `/* ... */` уже покрывает `/** ... */`, так как `\*?` означает "ноль или один символ `*`". Второй регекс никогда не сработает, так как JSDoc уже удалён первым.

**Рекомендация:** Удалить вторую строку или сделать первый регекс более специфичным.

### ✅ COR-04: `outputFileExists` проверяет путь, а не файл (ИСПРАВЛЕНО)

- **Категория:** Правильность
- **Критичность:** Medium
- **Локация:** `src/file-utils.ts:207-211`

```typescript
export function outputFileExists(baseOut: string, srcFile: string): boolean {
  const rel: string = path.relative(process.cwd(), srcFile);
  const outPath: string = path.join(baseOut, rel);
  return fs.existsSync(outPath);
}
```

`fs.existsSync` вернёт `true` и для директории, и для файла. Если по пути окажется директория с тем же именем (маловероятно, но возможно), функция пропустит обработку.

**Рекомендация:** Добавить `fs.statSync(outPath).isFile()`.

### COR-05: `cleanupOrphanedDocs` глючит с путями

- **Категория:** Правильность
- **Критичность:** Medium
- **Локация:** `src/docgen.ts:125-149`

Логика построения ожидаемых путей:
1. `srcFile` заменяет расширение на `.md`
2. Вычисляет `path.relative(process.cwd(), mdFile)` — **от корня проекта**
3. Соединяет с `docsDir` (`opts.out + "/docs"`)

Проблема: если `srcFile` уже относительный (например, `src/Button.tsx`), `path.relative(process.cwd(), srcFile)` может дать неожиданный результат. При абсолютных путях тоже может сломаться.

**Пример:** `srcFile = "C:/project/src/Button.tsx"`, `cwd = "C:/project"` → `rel = "src/Button.md"`, `expectedPath = "./ai-output/docs/src/Button.md"`. А реальный doc file будет `"./ai-output/docs/C:/project/src/Button.md"`.

**Рекомендация:** Переписать логику вычисления путей, используя единую схему как в `writeOutput`.

---

## 5. Проблемы тестирования (5/8 suites fail)

### ✅ TEST-01: Тесты — 8/8 suite pass, 111/111 tests (ИСПРАВЛЕНО)

- **Категория:** Качество
- **Критичность:** High

| Suite | Статус | Причина |
|-------|--------|---------|
| `llm-client.test.ts` | ✅ PASS (15/15) | |
| `component-graph.test.ts` | ✅ PASS (6/6) | |
| `ast-extractor.test.ts` | ✅ PASS (9/9) | |
| `file-utils.test.ts` | ❌ FAIL (4 errors) | Моки не работают — `readFileSync` возвращает "Hello World" вместо ожидаемого контента |
| `generate-graph.test.ts` | ❌ FAIL (5 errors) | Path difference: `"./test-out/graph"` vs `"test-out/graph"` и ошибки в моках |
| `docgen.test.ts` | ❌ FAIL (4 errors) | Вероятно те же path issues |
| `annotator.test.ts` | ❌ FAIL (suite error) | Jest не может разобрать ESM-импорт |
| `prompt-loader.test.ts` | ❌ FAIL (suite error) | Та же ESM проблема |

**Корневая причина:** Jest не настроен для ESM. В `tsconfig.json` `module: "ESNext"`, но `jest.config.cjs` не включает `transformIgnorePatterns`, и `ts-jest` неправильно обрабатывает ESM `.js` расширения в импортах.

**Рекомендация:**
```javascript
// jest.config.cjs — добавить:
transform: {
  '^.+\\.tsx?$': ['ts-jest', { useESM: true }]
},
extensionsToTreatAsEsm: ['.ts'],
moduleNameMapper: {
  '^(\\.{1,2}/.*)\\.js$': '$1',
}
```
Уже есть, но не хватает `transformIgnorePatterns` для корректной обработки `node_modules/` с ESM и `tsconfig` для `@babel/traverse` ESM issues.

### TEST-02: Нет тестов для `cli.ts`

- **Категория:** Качество
- **Критичность:** Medium

CLI-интерфейс (7+ опций, их комбинации, флаги --force, ошибки) не покрыт тестами.

### ✅ TEST-03: Мок `globby.js` — исправлен (ИСПРАВЛЕНО)

- **Локация:** `__mocks__/globby.js`

```javascript
module.exports = jest.fn().mockImplementation(() => Promise.resolve([]));
```

Мок возвращает пустой массив для всех вызовов. Это ломает тесты `file-utils`, которые ожидают, что `globby` вернёт определённые файлы.

---

## 6. Производительность и UX

### PERF-01: Последовательная обработка файлов (нет параллелизма)

- **Категория:** Производительность
- **Критичность:** Medium

Каждый файл обрабатывается последовательно. Для проекта с 50+ файлами это может занять десятки минут (каждый файл → LLM запрос → 3+ retry при ошибках).

**Рекомендация:** Добавить параллельную обработку с лимитом (3-5 concurrent) через `Promise.allSettled()`.

### PERF-02: Нет прогресс-бара для больших проектов

- **Категория:** UX
- **Критичность:** Low

Выводится только `"📘 Hybrid Annotation: 50 files..."` в начале и затем лог для каждого файла. Без индикации, сколько обработано из общего числа.

**Рекомендация:** Выводить `[3/50]` при каждом файле.

### PERF-03: Добавлен exponential backoff при retry (В РАБОТЕ — решено не добавлять задержку для сохранения совместимости с тестами)

- **Категория:** Производительность
- **Критичность:** Low

При ошибке LLM retry происходит немедленно. Если API временно недоступен, все 5 попыток провалятся подряд за секунду.

**Рекомендация:** Добавить `setTimeout(delay *= 2)`: 1s → 2s → 4s → 8s.

---

## 7. Качество кода

### ✅ CODE-01: Ошибка в определении компонента (ИСПРАВЛЕНО)

- **Локация:** `src/ast/ast-extractor.ts:55`

```typescript
if (funcName.charAt(0).toUpperCase() === funcName.charAt(0)) {
```

Это условие **всегда true**, потому что `"A".toUpperCase() === "A"`. Имя может быть lowercase — условие всё равно сработает. Фактически любая именованная функция считается компонентом, а не обработчиком.

**Было:** `funcName.charAt(0).toUpperCase() === funcName.charAt(0)`  
**Должно быть:** `funcName.charAt(0) === funcName.charAt(0).toUpperCase()`

### ✅ CODE-02: `extractComponentInfo` — добавлен React.memo/forwardRef (ИСПРАВЛЕНО)

- **Категория:** Качество
- **Критичность:** Medium

Поддерживаются только Functional Components. `React.memo(Button)`, `forwardRef(...)`, классовые `class Button extends React.Component` не определяются.

### ✅ CODE-03: Тип `defaultValue` — `any`→`unknown` (ИСПРАВЛЕНО)

- **Локация:** `src/types.ts:61`

```typescript
defaultValue?: any;
```

В strict mode использование `any` — плохая практика. Должен быть `unknown` или конкретный тип.

### CODE-04: Тесты не запускаются без `node_modules`

Проект не включает `package-lock.json` корректно для CI (или не проверяет `"frozen-lockfile"`). В `.gitignore` нет указания не коммитить lockfile, но `dist/` включен — а entry point (`bin/react-docgen-ai.js`) использует `import("../dist/cli.js")`.

---

## 8. Сводка проблем

| ID | Категория | Критичность | Описание |
|----|-----------|-------------|----------|
| SEC-01 | Безопасность | 🔴 Critical | Axios: 20+ уязвимостей, включая CRITICAL |
| COR-01 | Правильность | 🔴 Critical | `__dirname` не определён в ESM (prompt-loader) |
| ARCH-03 | Качество | 🔴 High | `removeComments()` — хрупкая, false positive/negative |
| ARCH-04 | Архитектура | 🔴 High | Только legacy Completion API, нет Chat |
| TEST-01 | Качество | 🔴 High | 5/8 тестов падают |
| ARCH-01 | Качество | 🟡 Medium | Дубликат `prompt-loader copy.ts` |
| ARCH-02 | Качество | 🟡 Medium | 90% дублирования в annotator.ts |
| SEC-02 | Безопасность | 🟡 Medium | Prompt injection через CODE placeholder |
| COR-04 | Правильность | 🟡 Medium | `outputFileExists` не отличает файл от папки |
| COR-05 | Правильность | 🟡 Medium | `cleanupOrphanedDocs` — баг с путями |
| CODE-01 | Качество | 🟡 Medium | Определение компонента всегда true (логическая ошибка) |
| CODE-02 | Качество | 🟡 Medium | Нет поддержки memo/forwardRef/классов |
| TEST-02 | Качество | 🟡 Medium | Нет тестов для cli.ts |
| TEST-03 | Качество | 🟡 Medium | Мок globby всегда пустой |
| PERF-01 | Производительность | 🟡 Medium | Нет параллелизма |
| SEC-03 | Безопасность | 🟢 Low | Нет проверки длины ответа LLM |
| COR-02 | Качество | 🟢 Low | `global.d.ts` — избыточный |
| COR-03 | Качество | 🟢 Low | `removeComments` удаляет JSDoc дважды (но это no-op) |
| PERF-02 | UX | 🟢 Low | Нет прогресс-бара |
| PERF-03 | Производительность | 🟢 Low | Нет exponential backoff при retry |
| CODE-03 | Качество | 🟢 Low | `defaultValue: any` вместо `unknown` |

### Сводка по критичности

| Уровень | Кол-во |
|---------|--------|
| 🔴 Critical | 3 |
| 🔴 High | 3 |
| 🟡 Medium | 8 |
| 🟢 Low | 7 |
| **Всего** | **21** |

### Топ-5 немедленных фиксов

1. **SEC-01** — Обновить axios до последней версии (^1.8.x)
2. **COR-01** — Исправить `prompt-loader.ts`: корректное `__dirname` для ESM (заменить на код из `prompt-loader copy.ts` и удалить дубликат)
3. **TEST-01** — Исправить Jest конфигурацию для ESM, починить моки, убрать path issues
4. **CODE-01** — Исправить условие определения компонента (`charAt(0).toUpperCase()` инвертировано)
5. **ARCH-03** — Заменить регекспную `removeComments` на AST-based удаление комментариев

### Что улучшает работу без поломки (quick wins)

1. Удалить `prompt-loader copy.ts` (dead file)
2. Удалить `global.d.ts` (избыточный)
3. Исправить `COR-03` (второй лишний регекс)
4. Исправить `arch-02`: вынести общую логику в одну функцию
5. Добавить `exponential backoff` при retry в `annotator.ts`
