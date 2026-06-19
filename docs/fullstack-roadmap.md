# Full Stack Roadmap для react-docgen-ai

Что нужно изменить, чтобы проект поддерживал не только React, но и full stack приложения.

## 🔴 Слой 1 — Типы (`types.ts`)

Сейчас всё завязано на React:

```ts
interface ComponentInfo {
  name, props, state, effects, handlers, jsxTree, fileType, hasContext, hasStore
}
type FileType = "component" | "hook" | "context" | "store" | "util" | "types"
```

Нужно:

- `FileInfo` — generic интерфейс вместо `ComponentInfo`
- `FileType` — расширить: `api-route`, `middleware`, `service`, `db-model`, `config`, `server`, `schema`, `utils`
- React-специфику вынести в расширение `ReactFileInfo extends FileInfo`
- Аналогично: `ExpressRouteInfo`, `HonoRouteInfo` и т.д.
- `Framework` — тип для детекции: `'react' | 'express' | 'hono' | 'next' | 'fastify' | 'generic'`

## 🔴 Слой 2 — AST-анализатор (`ast/ast-extractor.ts`)

Сейчас жёстко ищет React: `React.createElement`, `useState`, `useEffect`, JSX, `createContext`, Zustand/Jotai/Redux.

Нужно — архитектура детекторов:

```
ast/
├── extractor.ts            # Базовый экстрактор (imports, exports, functions, classes)
├── detectors/
│   ├── react.ts            # React (JSX, hooks, context)
│   ├── express.ts          # Express (app.get/post, router, middleware)
│   ├── hono.ts             # Hono (c.route, c.get, app.use)
│   ├── next-api.ts         # Next.js API routes
│   └── generic.ts          # Fallback (функции, классы, экспорты)
├── compact-format.ts       # Generic compact AST
└── component-graph.ts      # → rename to dependency-graph.ts
```

Каждый детектор:
1. Проверяет свои сигнатуры (по импортам/вызовам)
2. Извлекает свою специфику
3. Поставляет свои промпты

## 🔴 Слой 3 — Промпты

Сейчас 6 React-ориентированных файлов (`component.txt`, `hook.txt`, ...).

Нужно:

```
prompts/
├── generic/
│   ├── function.txt
│   ├── class.txt
│   └── module.txt
├── react/
│   ├── component.txt, hook.txt, context.txt, store.txt
├── express/
│   ├── route.txt
│   ├── middleware.txt
│   └── router.txt
├── hono/
│   └── route.txt
└── next/
    ├── page.txt
    └── api-route.txt
```

Выбор промпта — по `Framework` + `FileType`.

## 🔴 Слой 4 — Граф зависимостей

Сейчас: `buildComponentGraph` — React-компоненты через JSX.

Нужно:
- Generic import graph (все файлы → их imports/exports)
- Фреймворк-специфичные прослойки: React → parent/child компоненты, Express → route → middleware → handler

## 🔴 Слой 5 — CLI

Добавить:
- `--framework` или автоопределение (по анализу `package.json`, `import` statements)
- `--stack` для комбинаций (`react` + `express` в одном проекте)
- Автоопределение: сканируем импорты, определяем фреймворки

## 🟡 Слой 6 — Wiki и документация

Wiki уже достаточно агностична (generic markdown + frontmatter). Нужно:
- Секции в index.md по фреймворкам/слоям (API, Frontend, Database)
- Визуализация мульти-фреймворкового графа

## Оценка сложности

| Слой | Сложность | Файлов | Затрагивает тесты |
|------|-----------|--------|-------------------|
| 1. Типы | 🟡 Средне | `types.ts` | Все |
| 2. AST | 🔴 Высоко | 10+ файлов | Да |
| 3. Промпты | 🟡 Средне | ~20 файлов | Нет |
| 4. Граф | 🟡 Средне | `component-graph.ts` | Да |
| 5. CLI | 🟢 Легко | `cli.ts` | Нет |
| 6. Wiki | 🟢 Легко | `wiki-generator.ts` | Да |

## Стратегия: форк или эволюция?

### Форк
Плюсы: чистая архитектура с нуля, без обратной совместимости.
Минусы: ~60% кода (pipeline, wiki, LLM, CLI, file-utils) придётся дублировать.

### Эволюция (монорепа)
Ребрендинг в `docgen-ai` с пакетами:

```
docgen-ai/
├── packages/
│   ├── core/          # pipeline, wiki, cli, llm — generic
│   ├── detector-react  # react-specific
│   ├── detector-express # новый
│   └── detector-hono   # новый
```

React — один из фреймворков, не обязательный.

### Вывод
- Форк — для хобби/портфолио
- Эволюция — для развиваемого инструмента
