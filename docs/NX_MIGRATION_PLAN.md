# Nx Monorepo Migration Plan

> **Branch:** `feature/nx-migration` (from `product/main`)  
> **Status:** Not Started  
> **Last Updated:** 2026-02-24

## Summary

Migrate ace-step-ui from a flat two-package structure (root frontend + `server/` backend) into a well-structured Nx monorepo using pnpm. Add Tailwind v4 (build-time, replacing CDN) and shadcn/ui with Slate theme. Decompose the monolithic 1557-line `App.tsx` into custom hooks. Create a shared types library consumed by both frontend and backend.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Migration approach | Fresh Nx workspace, move code in | Cleanest structure; repo history preserved via commits |
| Package manager | pnpm | Fast, disk-efficient, native workspace support |
| App.tsx | Decompose into hooks | Aligns with Nx modular philosophy; ~1557 → ~250 lines |
| Shared types | Yes — `libs/shared-types` | Frontend `types.ts` + backend inline types unified |
| shadcn theme | Slate | Matches existing dark Spotify-like aesthetic |
| Tailwind | v4 build-time (via `@tailwindcss/vite`) | Required for shadcn; replaces CDN `<script>` tag |
| shadcn migration | Additive only | Install components but don't replace existing UI yet |

## Target Structure

```
ace-step-ui/
├── nx.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── package.json                    # Root workspace config + Nx scripts
├── .npmrc
├── apps/
│   ├── web/                        # React 19 + Vite frontend (port 3000)
│   │   ├── project.json
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   ├── index.html
│   │   ├── public/
│   │   └── src/
│   │       ├── main.tsx            # Entry point (was index.tsx)
│   │       ├── styles/
│   │       │   └── global.css      # Tailwind v4 + extracted inline CSS
│   │       ├── app/
│   │       │   ├── App.tsx         # Slim orchestrator (~250 lines)
│   │       │   ├── hooks/          # Extracted state hooks
│   │       │   │   ├── useAuth.ts
│   │       │   │   ├── usePlayer.ts
│   │       │   │   ├── useGeneration.ts
│   │       │   │   ├── usePlaylistManager.ts
│   │       │   │   ├── useLibrary.ts
│   │       │   │   ├── useThemeMode.ts
│   │       │   │   ├── useToastManager.ts
│   │       │   │   ├── useServiceHealth.ts
│   │       │   │   └── useViewRouter.ts
│   │       │   └── views/          # View containers (optional)
│   │       ├── components/         # Existing 24 components
│   │       │   └── ui/             # shadcn components (auto-generated)
│   │       ├── context/            # AuthContext, I18nContext, ResponsiveContext
│   │       ├── services/           # api.ts, geminiService.ts
│   │       ├── i18n/               # translations.ts
│   │       ├── data/               # genres.ts, styles, news
│   │       └── lib/
│   │           └── utils.ts        # shadcn utility (cn function)
│   └── api/                        # Express + SQLite backend (port 3001)
│       ├── project.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── main.ts             # Entry point (was index.ts)
│       │   ├── config/
│       │   ├── db/
│       │   ├── middleware/
│       │   ├── routes/
│       │   └── services/
│       ├── public/                 # Static assets (audio, demucs-web, editor)
│       ├── data/                   # SQLite DB
│       └── scripts/                # Python scripts
├── libs/
│   └── shared-types/               # Shared TypeScript interfaces
│       ├── project.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts            # Re-exports
│           ├── song.ts             # Song, Comment
│           ├── generation.ts       # GenerationParams, GenerationResult
│           ├── playlist.ts         # Playlist
│           ├── user.ts             # User, UserProfile
│           ├── player.ts           # PlayerState
│           └── views.ts            # View
├── scripts/                        # Platform startup scripts
├── docs/                           # This plan + other docs
└── .github/                        # Copilot instructions, workflows
```

---

## Phases

### Phase 1: Scaffold Nx Workspace + pnpm
**Status:** ⬜ Not Started

- [ ] Create branch `feature/nx-migration` from `product/main`
- [ ] Install pnpm globally (`npm install -g pnpm`)
- [ ] Run `pnpm dlx nx@latest init` — accept `@nx/vite` plugin
- [ ] Create `pnpm-workspace.yaml` with `apps/*` and `libs/*`
- [ ] Create `tsconfig.base.json` with shared compiler options and path aliases:
  - `@ace-step/shared-types` → `libs/shared-types/src/index.ts`
- [ ] Add `.npmrc` with `shamefully-hoist=true`
- [ ] Delete existing `node_modules/` and `server/node_modules/`
- [ ] Run `pnpm install` and verify lockfile generation

**Checkpoint:** `pnpm install` succeeds, `nx.json` exists.

---

### Phase 2: Create Target Directory Structure
**Status:** ⬜ Not Started

- [ ] Create `apps/web/`, `apps/api/`, `libs/shared-types/` directories
- [ ] Create `project.json` for each project:
  - `apps/web/project.json` — targets: build (vite build), dev (vite dev), serve (vite preview)
  - `apps/api/project.json` — targets: build (tsc), dev (tsx watch), serve (node dist/main.js)
  - `libs/shared-types/project.json` — targets: build (tsc)
- [ ] Create `tsconfig.json` for each project (extending `../../tsconfig.base.json`)

**Checkpoint:** `nx graph` shows 3 projects.

---

### Phase 3: Move Frontend Code → `apps/web/`
**Status:** ⬜ Not Started

**Files to move:**
- [ ] `App.tsx` → `apps/web/src/app/App.tsx`
- [ ] `index.tsx` → `apps/web/src/main.tsx`
- [ ] `components/` → `apps/web/src/components/`
- [ ] `context/` → `apps/web/src/context/`
- [ ] `services/` → `apps/web/src/services/`
- [ ] `i18n/` → `apps/web/src/i18n/`
- [ ] `data/` → `apps/web/src/data/`
- [ ] `global.d.ts`, `vite-env.d.ts` → `apps/web/src/`

**Configuration:**
- [ ] Create `apps/web/vite.config.ts` (from existing, update `@` alias to `./src`)
- [ ] Create `apps/web/tsconfig.json` with paths `@/*` → `./src/*`
- [ ] Create `apps/web/index.html`:
  - Strip CDN Tailwind `<script>` tag
  - Strip import map
  - Strip inline `<style>` block (~150 lines)
  - Add `<script type="module" src="/src/main.tsx">`
- [ ] Extract inline CSS → `apps/web/src/styles/global.css`
- [ ] Extract Tailwind config → Tailwind v4 `@theme` directives in CSS

**Import path updates:**
- [ ] Update all `from '@/types'` → `from '@ace-step/shared-types'`
- [ ] Verify `@/components/...`, `@/services/...`, `@/context/...` all resolve with new alias

**Checkpoint:** `nx dev @ace-step/web` starts Vite dev server, page loads (may not be styled yet).

---

### Phase 4: Move Backend Code → `apps/api/`
**Status:** ⬜ Not Started

**Files to move:**
- [ ] `server/src/` → `apps/api/src/`
- [ ] `server/public/` → `apps/api/public/`
- [ ] `server/data/` → `apps/api/data/`
- [ ] `server/scripts/` → `apps/api/scripts/`
- [ ] `server/package.json` → `apps/api/package.json` (deps only)
- [ ] `server/tsconfig.json` → `apps/api/tsconfig.json` (extend base)

**Refactoring:**
- [ ] Rename `apps/api/src/index.ts` → `apps/api/src/main.ts`
- [ ] Extract inline routes from `main.ts` (~300 lines):
  - oEmbed handler → `apps/api/src/routes/oembed.ts`
  - Song share page → `apps/api/src/routes/share.ts`
  - Image proxy → `apps/api/src/routes/proxy.ts`
  - Pexels proxy → `apps/api/src/routes/pexels.ts`
  - Search → `apps/api/src/routes/search.ts` (if not already)
- [ ] Update backend imports to use `@ace-step/shared-types` where applicable

**Vendored assets:**
- [ ] Consolidate `audiomass-editor/` (root) and `server/audio-editor/` into single location under `apps/api/public/`
- [ ] Verify demucs-web still served correctly

**Checkpoint:** `nx dev @ace-step/api` starts Express on port 3001, `/health` returns OK.

---

### Phase 5: Create Shared Types Library
**Status:** ⬜ Not Started

- [ ] Create `libs/shared-types/src/index.ts` re-exporting all types
- [ ] Create domain files from existing `types.ts` (160 lines):
  - `song.ts` — `Song`, `Comment`
  - `generation.ts` — `GenerationParams`, `GenerationResult`
  - `playlist.ts` — `Playlist`
  - `user.ts` — `User`, `UserProfile`
  - `player.ts` — `PlayerState`
  - `views.ts` — `View`
- [ ] Add any backend-only types that should be shared
- [ ] Verify path alias `@ace-step/shared-types` resolves in both `apps/web` and `apps/api`

**Checkpoint:** `nx build @ace-step/shared-types` succeeds. Both apps import from it without errors.

---

### Phase 6: Install and Configure shadcn
**Status:** ⬜ Not Started

- [ ] Install Tailwind v4 deps: `pnpm add tailwindcss @tailwindcss/vite --filter @ace-step/web`
- [ ] Add `@tailwindcss/vite` plugin to `apps/web/vite.config.ts`
- [ ] Add `@import "tailwindcss";` to `apps/web/src/styles/global.css`
- [ ] Run `pnpm dlx shadcn@latest init` in `apps/web/`:
  - Style: default
  - Base color: Slate
  - CSS variables: yes
- [ ] Create `apps/web/components.json` with correct aliases
- [ ] Create `apps/web/src/lib/utils.ts` (cn utility)
- [ ] Install foundational shadcn components:
  ```
  pnpm dlx shadcn@latest add button dialog dropdown-menu input label select slider tabs toast tooltip
  ```
- [ ] Verify shadcn components render with Slate theme

**Checkpoint:** Can import and render `<Button>` from `@/components/ui/button` in the app.

---

### Phase 7: Decompose App.tsx
**Status:** ⬜ Not Started

**Extract hooks** (from 1557-line `App.tsx` into `apps/web/src/app/hooks/`):

- [ ] `useAuth.ts` — auth state, login/logout, username management
- [ ] `usePlayer.ts` — player state, play/pause/seek, queue, current song
- [ ] `useGeneration.ts` — generation job management, polling, params state
- [ ] `usePlaylistManager.ts` — playlist CRUD, add/remove songs
- [ ] `useLibrary.ts` — song list, search, filtering, deletion
- [ ] `useThemeMode.ts` — dark/light mode toggle, local storage persistence
- [ ] `useToastManager.ts` — toast queue, show/dismiss
- [ ] `useServiceHealth.ts` — health check polling, Gradio status
- [ ] `useViewRouter.ts` — view state (which panel is active)

**Slim App.tsx:**
- [ ] Reduce to ~200-300 lines: import hooks, render layout shell
- [ ] Layout: `<Sidebar>` + main content area (view switch) + `<Player>` + modals
- [ ] All state logic lives in hooks, App.tsx is pure orchestration

**Optional — extract view containers:**
- [ ] `views/LibraryViewContainer.tsx`
- [ ] `views/CreateViewContainer.tsx`
- [ ] `views/SearchViewContainer.tsx`

**Checkpoint:** App renders and functions identically. Each hook is independently testable.

---

### Phase 8: Update Startup Scripts & Configuration
**Status:** ⬜ Not Started

- [ ] Update `scripts/start-dev.bat`, `scripts/start-dev.sh` for new paths (`apps/web/`, `apps/api/`)
- [ ] Update `scripts/start-pinokio-dev.bat`, `scripts/start-pinokio-dev.sh`
- [ ] Update `scripts/start-pinokio.bat`, `scripts/start-pinokio.sh`
- [ ] Update root `start-all.bat`, `start-all.sh`
- [ ] Update root `start.bat`, `start.sh`
- [ ] Add Nx-based scripts to root `package.json`:
  ```json
  {
    "dev": "nx run-many -t dev",
    "dev:web": "nx dev @ace-step/web",
    "dev:api": "nx dev @ace-step/api",
    "build": "nx run-many -t build",
    "start": "nx run-many -t serve"
  }
  ```
- [ ] Update `.github/copilot-instructions.md` with new architecture overview

**Checkpoint:** `pnpm dev` starts both frontend and backend. All platform scripts work.

---

### Phase 9: Clean Up Root
**Status:** ⬜ Not Started

**Remove moved files from root:**
- [ ] Delete: `App.tsx`, `index.tsx`, `types.ts`, `global.d.ts`, `vite-env.d.ts`, `vite.config.ts`
- [ ] Delete: `components/`, `context/`, `services/`, `i18n/`, `data/`
- [ ] Delete: `server/` directory
- [ ] Delete: `audiomass-editor/` (if consolidated into `apps/api/public/`)
- [ ] Remove old `tsconfig.json` (replaced by `tsconfig.base.json`)

**Final configuration:**
- [ ] Update `.gitignore` for Nx structure (`apps/*/node_modules`, `.nx/`, `dist/`)
- [ ] Verify `setup.bat` / `setup.sh` still work (or update for pnpm)
- [ ] Final `pnpm install` + `nx build` of all projects

**Checkpoint:** Clean root, no orphaned files, full build succeeds.

---

## End-to-End Verification

After all phases complete:

- [ ] `pnpm install` — clean install with no errors
- [ ] `nx build @ace-step/shared-types` — types compile
- [ ] `nx dev @ace-step/web` — Vite dev server on port 3000, Tailwind renders correctly
- [ ] `nx dev @ace-step/api` — Express on port 3001, ACESTEP_PATH resolves
- [ ] Frontend→Backend proxy works (API calls, audio serving)
- [ ] Generation flow: Simple Mode end-to-end
- [ ] Generation flow: Custom Mode end-to-end
- [ ] shadcn `<Button>` renders with Slate theme
- [ ] All 4 i18n languages work (en, zh, ja, ko)
- [ ] `nx graph` shows correct dependency graph
- [ ] Audio playback works
- [ ] Mobile viewport works
- [ ] Dark/light mode toggle works

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tailwind CDN → build-time breaks styles | High | Extract ALL custom colors/animations; test each component |
| Import map removal breaks production | Medium | Vite bundles everything; import map was dev-only convenience |
| ACESTEP_PATH resolution changes | High | Test with Pinokio and manual installations |
| SQLite path changes | Medium | Verify `apps/api/data/` resolves correctly from new working dir |
| Backend `.env` path resolution | Medium | Currently reads from parent dir; update for new structure |
| Vendored audiomass-editor breaks | Low | Static serving path must match; test editor route |
| pnpm hoisting breaks deps | Medium | `.npmrc` with `shamefully-hoist=true`; test `@ffmpeg` WASM |

---

## Notes

- Each phase should be committed separately so progress is saved
- Phases 1-5 are the critical path; 6-7 can be done in parallel
- Phase 7 (App.tsx decomposition) is highest risk; test thoroughly
- shadcn components are installed but NOT used to replace existing UI — that's future work
- The migration preserves all functionality; this is a structural change only
