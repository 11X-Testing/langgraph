# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repo basics
- Monorepo managed by **pnpm workspaces** (`pnpm-workspace.yaml`) and **Turborepo** (`turbo.json`).
- Node version requirements:
  - Root: `node >= 18` (`package.json`).
  - Some packages may require newer (e.g. `libs/langgraph/package.json` specifies `node >= 20`).

## Common commands (run from repo root)

### Install
```bash
pnpm install
```

### Build
Build all packages:
```bash
pnpm build
```
Build a single package:
```bash
pnpm --filter @langchain/langgraph build
pnpm --filter @langchain/langgraph-cua build
```

### Lint / format
Lint all packages:
```bash
pnpm lint
```
Fix lint:
```bash
pnpm lint:fix
```
Format all packages:
```bash
pnpm format
```
Check formatting:
```bash
pnpm format:check
```

### Tests
Run all tests (Turbo runs per-package `test` scripts):
```bash
pnpm test
```
Run tests for a single package:
```bash
pnpm --filter @langchain/langgraph test
pnpm --filter @langchain/langgraph-cua test
```
Run a single Vitest file inside a package (pass-through args after `--`):
```bash
pnpm --filter @langchain/langgraph test -- src/**/your.test.ts
pnpm --filter @langchain/langgraph-cua test -- src/tests/cua.test.ts
```
Watch mode (where supported):
```bash
pnpm --filter @langchain/langgraph test:watch
pnpm --filter @langchain/langgraph-cua test:watch
```
Integration tests across the repo (brings up/down docker deps):
```bash
pnpm test:int
```
Integration tests for a single package that uses `vitest --mode int`:
```bash
pnpm --filter @langchain/langgraph test:int
pnpm --filter @langchain/langgraph-cua test:int
```

### Changesets / release
Create a changeset:
```bash
pnpm changeset
```
Publish (expects changesets already created):
```bash
pnpm release
```

### Docs (Typedoc)
Build docs site artifacts (Typedoc) from `docs/`:
```bash
pnpm --filter docs build
```

## Codebase structure (big picture)

### Workspace layout
- `libs/*`: primary packages.
- `examples/*`: runnable example projects (each is its own workspace package).
- `docs/`: typedoc configuration/deps for generating API docs.
- `internal/build/` (`@langchain/build`): custom build system used by most packages’ `build:internal` scripts.

### Build system overview (`internal/build`)
Most publishable packages define an `exports` map that includes an **`input`** field per entrypoint (example: `libs/langgraph-core/package.json`, `libs/checkpoint/package.json`). The internal build tool uses these `input` paths to discover what TypeScript sources to compile.
- When adding a new entrypoint to a package, update its `package.json#exports` with an `input` pointing at the source file.
- Packages commonly compile via:
  - `pnpm --filter @langchain/build compile <packageName>` (invoked by each package’s `build:internal` script).

### LangGraph core architecture
The main published core package is:
- `libs/langgraph-core/` → npm package **`@langchain/langgraph`**

Conceptual layers (see `CLAUDE.md`):
- Channels/state primitives: `libs/langgraph-core/src/channels/` (exported as `@langchain/langgraph/channels`).
- Checkpointing/persistence interfaces and backends:
  - Base interface: `libs/checkpoint/` → `@langchain/langgraph-checkpoint`
  - Backends: `libs/checkpoint-*` (postgres/redis/sqlite/mongodb/etc.).
- Execution engine (Pregel-style supersteps): `libs/langgraph-core/src/pregel/` (exported as `@langchain/langgraph/pregel`).
- Graph authoring + higher-level APIs and prebuilt patterns:
  - Core exports: `libs/langgraph-core/src/index.ts`
  - Prebuilt helpers: `libs/langgraph-core/src/prebuilt/` (exported as `@langchain/langgraph/prebuilt`).

There is also a private wrapper package:
- `libs/langgraph/` (package name `langgraph`, private) depends on `@langchain/langgraph`.

### Computer Use Agent package (`libs/langgraph-cua`)
Package: `libs/langgraph-cua/` → **`@langchain/langgraph-cua`**

Key entrypoints and flow:
- `libs/langgraph-cua/src/index.ts`: exports `createCua()`, which builds a `StateGraph` with nodes:
  - `callModel` (`src/nodes/call-model.ts`): calls OpenAI `computer-use-preview` via `@langchain/openai` (Responses API). Handles ZDR behavior and (when needed) converts screenshot URLs to base64.
  - `createVMInstance` (`src/nodes/create-vm-instance.ts`): ensures an “instance” exists and stores `instanceId` in state.
  - `takeComputerAction` (`src/nodes/take-computer-action.ts`): executes the model’s computer actions and returns a `ToolMessage` containing a screenshot (optionally via `uploadScreenshot`).
  - Optional hooks: `nodeBeforeAction` / `nodeAfterAction` passed into `createCua()`.
- `libs/langgraph-cua/src/types.ts`: state/configurable schema (`CUAAnnotation`, `CUAConfigurable`) and defaults.
- Tests use Vitest with a dedicated integration mode:
  - `libs/langgraph-cua/vitest.config.js` defines `--mode int` to include only `**/*.int.test.ts` and extend timeouts.
  - Unit tests: `src/tests/*.test.ts`
  - Integration tests: `src/tests/*.int.test.ts`

Note: `libs/langgraph-cua/README.md` describes Scrapybara as the default VM backend; the implementation details in `src/` should be treated as the source of truth when debugging runtime behavior.