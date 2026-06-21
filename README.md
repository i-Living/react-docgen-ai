# React Docgen AI

An advanced CLI tool for automatic documentation and annotation of React projects using LLM.

## ✨ Features

- **AST analysis** — deep analysis of React components (JSX, state, effects, handlers, props, component tree)
- **LLM integration** — works with local models (HTTP API) and cloud models via OpenCode SDK
- **Automatic annotation** — adds JSDoc comments (with copy or in-place modes)
- **Documentation generation** — Markdown or JSON documentation with hash-based incremental updates
- **LLM Wiki** — Obsidian-compatible wiki with `[[wikilinks]]`, YAML frontmatter and log.md
- **Component graph** — dependency visualization in DOT and Markdown formats
- **Token optimization** — compact AST, type-specific prompts, skip analysis, hash caching
- **TypeScript** — fully typed codebase

## 🚀 Installation

```bash
# Requirements: Bun >= 1.3, Node.js 16+
bun install
bun run build
```

## 🎯 Usage

```bash
# Annotate code
bun run start -- --src ./src --annotate

# Generate documentation
bun run start -- --src ./src --docs

# Component graph
bun run start -- --src ./src --graph

# LLM Wiki (Obsidian-compatible)
bun run start -- --src ./src --wiki
```

## ⚙️ Full options list

| Option | Description | Default |
|--------|-------------|---------|
| `--src, -s` | Path to source directory or file | **Required** |
| `--out, -o` | Output directory | `./ai-output` |
| `--annotate` | Annotate with copy | `false` |
| `--annotate-inplace` | Annotate in-place | `false` |
| `--docs` | Generate documentation | `false` |
| `--graph` | Generate component graph | `false` |
| `--wiki [path]` | Generate LLM Wiki | env or — |
| `--extensions, -e` | File extensions | `js,jsx,ts,tsx` |
| `--api` | LLM API URL | `http://localhost:8000/completions` |
| `--opencode` | Use OpenCode SDK | `false` |
| `--opencode-model` | OpenCode model (provider/model) | from profile |
| `--max-tokens` | Max tokens for LLM | `4096` |
| `--temperature` | LLM temperature | `0.1` |
| `--parallel` | Parallel LLM requests | `4` |
| `--format` | Documentation format: `markdown`, `json` | `markdown` |
| `--force` | Overwrite existing files | `false` |
| `--dry-run` | Dry run (no LLM, no writes) | `false` |
| `--verbose` | Verbose output | `false` |
| `--quiet` | Quiet mode (errors only) | `false` |
| `--stream` | Stream output for HTTP provider | `false` |
| `--prompt-dir` | Custom prompt files | built-in |

### Configuration via .env

| Variable | CLI equivalent | Default |
|----------|----------------|---------|
| `LLM_API_URL` | `--api` | `http://localhost:8000/completions` |
| `LLM_MAX_TOKENS` | `--max-tokens` | `4096` |
| `LLM_TEMPERATURE` | `--temperature` | `0.1` |
| `LLM_API_MODEL` | `--opencode-model` | `deepseek-v4-flash` |
| `DOCGEN_OUT` | `--out` | `./ai-output` |
| `DOCGEN_EXTENSIONS` | `--extensions` | `js,jsx,ts,tsx` |
| `DOCGEN_WIKI` | `--wiki` | — |
| `DOCGEN_PARALLEL` | `--parallel` | `4` |

## 📖 LLM Wiki

The `--wiki` mode creates Obsidian-compatible documentation in the style of [Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f):

```
wiki/
├── index.md           # Component catalog
├── log.md             # Change history
├── entities/          # Component pages
│   ├── button.md
│   └── header.md
└── _archive/          # Archived pages
```

**Features:**
- Persistence — on re-run, only changed files are updated (hash-based)
- `[[wikilinks]]` based on the dependency graph
- YAML frontmatter (title, created, updated, tags, source, confidence, hash)
- Archiving — when a source file is deleted, its wiki page moves to `_archive/`
- Change history in `log.md`

## 🧠 Token optimization

Four-tier system for minimizing LLM costs:

1. **Skip analysis** — files with no meaningful content (pure types, empty utilities) are skipped before LLM calls
2. **Hash incremental updates** — SHA-256 hash of file content; on match with a previous run, existing documentation is reused without calling the LLM
3. **Type-specific prompts** — each file type (component, hook, context, store, util, types) gets its own concise prompt (instead of a universal 85-line one)
4. **Compact AST** — text signature instead of `JSON.stringify` (50–100 tokens vs 600–800); auto-selection: ≤100 lines → signatures only, >100 lines → signatures + code

**Impact:** ~80% savings on payload and ~82% on prompt size.

## 🔧 Development

### Scripts

| Command | Description |
|---------|-------------|
| `bun run build` | Compile TypeScript |
| `bun run dev` | Auto-rebuild on changes |
| `bun run start` | Run |
| `bun run test` | Core tests (no mocks) |
| `bun run test:mock` | Tests with mock modules |
| `bun run test:all` | All tests |
| `bun run typecheck` | Type checking |
| `bun run clean` | Clean dist |

### Project structure

```
src/
├── cli.ts                 # CLI entry point
├── types.ts               # Types and interfaces
├── llm.ts                 # LLM facade (HTTP / OpenCode)
├── llm-client.ts          # HTTP client with retry
├── opencode-provider.ts   # OpenCode provider
├── prompt-loader.ts       # Type-specific prompt loader
├── pipeline.ts            # Parallel pipeline
├── progress.ts            # Progress bar
├── annotator.ts           # Annotation engine
├── docgen.ts              # Documentation generator
├── wiki-generator.ts      # LLM Wiki generator
├── generate-graph.ts      # Component graph generator
├── file-utils.ts          # File utilities + SHA-256 hash
├── env.ts                 # .env loader
├── ast/
│   ├── ast-extractor.ts   # AST extractor + file type detection
│   ├── compact-format.ts  # Compact AST format
│   └── component-graph.ts # Dependency graph
└── prompts/               # Type-specific prompts
    ├── annotation.txt
    ├── component.txt
    ├── hook.txt
    ├── context.txt
    ├── store.txt
    ├── util.txt
    └── types.txt
```

## 🧪 Testing

The project uses **Bun test** (unified runner, no Jest).

```bash
# Core 98 tests (pure functions, AST, pipeline)
bun run test

# Mock tests (isolated due to mock.module)
bun run test:mock

# All 117 tests
bun run test:all
```

## 🤝 Contributing

PRs and issues are welcome!
