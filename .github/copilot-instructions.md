# ACE-Step UI - Repository-Wide Instructions

**Independent Development:** This project was originally forked from fspecii/ace-step-ui but now operates independently. The upstream project appears inactive (no commits in several weeks), so we've simplified our workflow to work directly from our own repository.

**Note:** This file contains general architecture and workflows. See `.github/instructions/` for path-specific coding standards.

## Contribution Workflow

**Simplified branch model:**

```bash
# Create feature branch from product/main
git checkout product/main
git pull origin product/main
git checkout -b feature/amazing-feature

# Make changes following existing patterns
# ...

# Commit with clear message
git commit -m 'Add amazing feature'

# Push to origin (CambridgeMonorail/ace-step-ui)
git push origin feature/amazing-feature

# Open Pull Request on GitHub to product/main
```

**Before coding:**

1.  Read similar existing files to understand patterns
2.  Match the style and structure already in use
3.  Don't introduce new patterns without discussion

## Development Workflow

### Branch model
- `product/main` is our default and only long-lived branch
- All work happens on short-lived branches: `feature/*` or `fix/*`
- Feature branches are merged into `product/main` via PRs

### Branch creation
- Branch from `product/main` for all new work
- One concern per branch
- Naming: `feature/<short-description>` or `fix/<short-description>`

### PR discipline
When a branch has an open PR:
- Treat the branch as review-only
- Only apply review feedback or minimal fixes
- Do not add unrelated changes to that branch

If new work is required while a PR is open:
- Create a new branch
- Do not stack new work onto the PR branch

### Multiple workstreams and dependencies
- Always use separate branches for separate items of work
- If Feature B depends on Feature A:
  - Branch B from A locally
  - Do not open a PR for B until A is merged
  - Be prepared to rebase B if A changes

### Sync workflow
We use rebase to keep history clean. Do not create merge commits.

Update your feature branch:
```bash
git checkout product/main
git pull origin product/main
git checkout feature/your-feature
git rebase product/main
```

### PR quality rules
All PRs should:
- Be small and focused
- Avoid unrelated refactors
- Include: what changed, why, how to test, and trade-offs

Large or architectural changes should be discussed in an issue before implementation.

### Copilot agent behaviour requirements
Copilot must:
- Confirm the target branch before making changes
- Always branch from `product/main` for new work
- Never add unrelated changes to a branch with an open PR
- Prefer creating a new branch per concern
- Suggest splitting work if multiple concerns are present
- Follow rebase-only workflow (no merge commits)
- If branch context is unclear, ask before proceeding

## Architecture Overview

**Three-tier local-first AI music generation platform:**

1.  **Frontend** (React 19 + TypeScript + Vite) - Port 3000
    
    -   Single-page app with Spotify-like interface
    -   All state managed in `App.tsx` (1500+ line component)
    -   Vite proxies `/api`, `/audio`, `/editor`, `/blog` to backend
2.  **Backend** (Express + SQLite) - Port 3001
    
    -   REST API server in `server/src/`
    -   SQLite database (better-sqlite3) for local-first persistence
    -   Manages audio files in `server/public/audio/`
    -   Communicates with ACE-Step Gradio API
3.  **ACE-Step Gradio API** (External Python service) - Port 8001
    
    -   The actual AI music generation model (not part of this repo)
    -   Backend uses `@gradio/client` to call `/generation_wrapper` endpoint
    -   Connection managed by `server/src/services/gradio-client.ts`

## Critical Development Workflows

### Starting the Full Stack

**⚠️ CRITICAL: Always check if services are already running BEFORE starting new ones**

```bash
# FIRST: Check what's already running
netstat -ano | grep -E ":(3000|3001|8001)" | grep LISTEN

# If all three ports show LISTENING, services are already running - DO NOT START AGAIN
```

**Recommended Startup Methods:**

### **For Development (Hot Reload Enabled):**

**Pinokio Installation:**
```bash
# Windows
cmd.exe //c scripts\start-pinokio-dev.bat

# Linux/macOS  
./scripts/start-pinokio-dev.sh
```

**Other Installations:**
```bash
# Windows
export ACESTEP_PATH=/path/to/ACE-Step-1.5
cmd.exe //c scripts\start-dev.bat

# Linux/macOS
export ACESTEP_PATH=/path/to/ACE-Step-1.5
./scripts/start-dev.sh
```

### **For Production Testing:**

**Pinokio Installation:**
```bash
# Windows
cmd.exe //c scripts\start-pinokio.bat

# Linux/macOS
./scripts/start-pinokio.sh
```

**Other Installations:**
```bash
# Windows
set ACESTEP_PATH=C:\path\to\ACE-Step-1.5
start-all.bat

# Linux/macOS
export ACESTEP_PATH=/path/to/ACE-Step-1.5
./start-all.sh
```

### **Manual Start (For Detailed Debugging):**

1. **Check if ACE-Step API is running** (port 8001):
   ```bash
   curl -s http://localhost:8001/v1/models
   ```
   If not running, start it:
   ```bash
   cd /c/Users/Docto/pinokio/api/ace-step-ui.pinokio.git/app/ACE-Step-1.5
   env/Scripts/python.exe acestep/api_server.py
   ```

2. **Check if Backend is running** (port 3001):
   ```bash
   curl -s http://localhost:3001/health
   ```
   If not running, start it:
   ```bash
   export ACESTEP_PATH="/c/Users/Docto/pinokio/api/ace-step-ui.pinokio.git/app/ACE-Step-1.5"
   cd /c/Projects/ace-step-ui/server
   npm run dev
   ```

3. **Check if Frontend is running** (port 3000):
   ```bash
   curl -s http://localhost:3000 | head -5
   ```
   If not running, start it:
   ```bash
   cd /c/Projects/ace-step-ui
   npm run dev
   ```

**DO NOT use start.bat or start-all.bat from code** - these spawn CMD windows that can't be monitored programmatically.

**Terminal Management:**
- Kill idle/failed terminals BEFORE starting new services
- Use `kill_terminal` tool to clean up
- Git Bash has 32 console limit - manage terminals carefully

**⚠️ CRITICAL: Backend requires ACESTEP_PATH environment variable**

The backend defaults to `../ACE-Step-1.5` if `ACESTEP_PATH` is not set. If you see errors like:

-   `spawn C:Projectsace-step-uiACE-Step-1.5envScriptspython.exe ENOENT`

This means the backend is looking in the wrong location. Set `ACESTEP_PATH` before starting the backend:

```bash
# Git Bash / Unix-like
export ACESTEP_PATH="/c/Users/$USER/pinokio/api/ace-step-ui.pinokio.git/app/ACE-Step-1.5"

# Windows CMD
set ACESTEP_PATH=C:\Users\%USERNAME%\pinokio\api\ace-step-ui.pinokio.git\app\ACE-Step-1.5

# PowerShell
$env:ACESTEP_PATH="C:\Users\$env:USERNAME\pinokio\api\ace-step-ui.pinokio.git\app\ACE-Step-1.5"
```

**Key Environment Variables:**

-   `ACESTEP_PATH` - Path to ACE-Step-1.5 installation (defaults to `../ACE-Step-1.5`)
-   `ACESTEP_API_URL` - Gradio API endpoint (default: `http://localhost:8001`, set in `server/.env`)
-   `GEMINI_API_KEY` - Optional, for AI-powered prompt enhancement

**Common ACE-Step Installation Locations:**

-   **Pinokio (1-click install):** `C:\Users\{Username}\pinokio\api\ace-step-ui.pinokio.git\app\ACE-Step-1.5`
-   **Manual Windows Portable:** `C:\ACE-Step-1.5` or `{workspace}\..\ACE-Step-1.5`
-   **Manual Standard Install:** User's preferred location with `uv` installation

**Setting ACESTEP_PATH for Pinokio:**

```bash
# Windows CMD
set ACESTEP_PATH=C:\Users\%USERNAME%\pinokio\api\ace-step-ui.pinokio.git\app\ACE-Step-1.5
start-all.bat

# Git Bash / Unix-like
export ACESTEP_PATH=/c/Users/$USER/pinokio/api/ace-step-ui.pinokio.git/app/ACE-Step-1.5
./start-all.sh
```

### Verifying Services Are Running

**CRITICAL: Always verify endpoints before assuming they're running**

```bash
# Check ACE-Step Gradio API (port 8001)
curl -s http://localhost:8001 | head -20
# Should return HTML with "gradio" in it

# Check Backend API (port 3001)
curl -s http://localhost:3001/health
# Should return: {"status":"ok","service":"ACE-Step UI API"}

# Check Frontend (port 3000)
curl -s http://localhost:3000 | grep -i "ace-step"
# Should return HTML with ACE-Step UI title

# Quick check all ports
netstat -ano | grep -E ":(3000|3001|8001)" | grep LISTEN
```

**If a service isn't running:**

1.  Check the terminal/window for error messages
2.  Verify dependencies are installed (`setup.bat`)
3.  Check port conflicts (kill existing processes if needed)
4.  Restart using `start-all.bat` or manual commands

**Stopping Services:**

-   **Windows (start-all.bat)**: Close the 3 CMD windows or press Ctrl+C in each
-   **Manual/Unix**: Use `stop-all.sh` or kill processes manually

### Audio Generation Flow

**User Action → Frontend → Backend → Gradio → Poll → Database → Frontend:**

1.  User submits generation params in `CreatePanel.tsx`
2.  Frontend calls `POST /api/generate/generate` with `GenerationParams` (see `types.ts`)
3.  Backend (`server/src/routes/generate.ts`) calls Gradio client:
    -   Builds 50 positional args via `buildGradioArgs()` in `server/src/services/acestep.ts`
    -   Calls Gradio `/generation_wrapper` endpoint
    -   Creates temp song record with `isGenerating: true`
4.  Frontend polls `GET /api/songs/:id` every 2 seconds
5.  Backend polls Gradio task status, saves completed audio to `server/public/audio/{songId}.{mp3|flac}`
6.  Song record updated with `audio_url: /audio/{songId}.mp3`, `isGenerating: false`
7.  Frontend receives completed song, adds to library

**Critical File:** `server/src/services/acestep.ts` - 940 lines mapping UI params to Gradio's 50-arg interface

## File Organization

```
ace-step-ui/
├── App.tsx              # Main app component (all state, all views)
├── components/          # 24 components (Player, Sidebar, CreatePanel, etc.)
├── context/             # 3 contexts (Auth, I18n, Responsive)
├── services/api.ts      # All API calls to backend
├── types.ts             # Shared TypeScript interfaces
├── i18n/translations.ts # ALL UI text in 4 languages
└── server/src/
    ├── routes/          # 9 route files (auth, songs, generate, etc.)
    ├── services/        # Gradio client, ACE-Step integration
    ├── db/              # SQLite pool + migrations
    └── public/audio/    # Generated audio files
```

## Key Files Reference

| File | Purpose |
|------|----------|
| `App.tsx` | All state, all views, 1500 lines - start here |
| `types.ts` | Central type definitions - read first |
| `services/api.ts` | All frontend API calls - see available endpoints |
| `server/src/services/acestep.ts` | Gradio integration - critical for generation |
| `server/src/services/gradio-client.ts` | Gradio client singleton |
| `server/src/db/migrate.ts` | Database schema - understand data model |
| `i18n/translations.ts` | All UI text - always update when adding strings |
| `vite.config.ts` | Proxy config - understand routing |

## Contributing Guidelines

**Follow existing patterns:**

-   Read similar files before creating new ones
-   Match naming conventions already in use
-   Use same code structure as neighboring components
-   Don't refactor existing code without discussion
-   Ask questions in PR if unsure about approach

**Internationalization is mandatory:**

-   ALL user-facing text uses `t('key')` - no exceptions
-   Add to all 4 languages (en, zh, ja, ko) in `i18n/translations.ts`
-   See `I18N_USAGE.md` for details

**Database changes:**

-   Add migrations, don't modify existing ones
-   Follow junction table patterns for relationships
-   Add indexes for new query patterns

**Testing:**

-   Manual E2E testing is the standard
-   Test generation flow end-to-end before submitting PR
-   Verify on both desktop and mobile viewports

## Debugging Workflows

### 🚨 DEBUGGING PRIORITY: Check Browser Console FIRST

**ALWAYS check the browser console for errors BEFORE doing anything else.**

When something goes wrong:

1.  **First**: `mcp_io_github_chr_list_console_messages()` - Check for obvious errors
2.  **Read the error message** - The console shows the ACTUAL error (e.g., spawn ENOENT, 400 validation)
3.  **Don't go searching logs** until you've read the browser console error
4.  **Error toasts disappear in ~3 seconds** - Console messages persist and show the real error

**Common browser console errors and what they mean:**

-   `spawn C:\Projects\ace-step-ui\ACE-Step-1.5...ENOENT` → Backend using wrong ACESTEP_PATH
-   `400: Song description required for simple mode` → Missing required field in form
-   `400: Style, lyrics, or reference audio required for custom mode` → Missing required field
-   `Gradio not available` → ACE-Step API not running or backend can't reach it

**Example debugging workflow:**

```javascript
// FIRST: Check console
mcp_io_github_chr_list_console_messages()

// OUTPUT: "Job xyz failed: spawn C:\Projects\ace-step-ui\ACE-Step-1.5\env\Scripts\python.exe ENOENT"
// This tells you EXACTLY what's wrong: ACESTEP_PATH is incorrect

// Fix: Restart backend with correct ACESTEP_PATH
// DON'T waste time searching backend logs or testing endpoints
```

### React UI Interaction (Chrome DevTools MCP)

**CRITICAL: This is a React app - DOM queries don't work reliably**

**⚠️ KNOWN LIMITATION: `mcp_io_github_chr_fill` does NOT trigger React's onChange handlers**

Chrome DevTools Protocol's `fill` command sets DOM values directly but doesn't fire React events. This means:
- Form validation that depends on state won't trigger
- Buttons that rely on form validity will stay disabled
- You can't fully test form submission flows via automation

**SOLUTION: Use test helpers exposed on window object**

The app exposes `window.__testHelpers` with functions to properly set form state:

```javascript
// Set form values (triggers React state updates)
window.__testHelpers.setSongDescription("A cheerful upbeat pop song");
window.__testHelpers.setLyrics("Verse 1...");
window.__testHelpers.setStyle("upbeat pop");
window.__testHelpers.setCustomMode(false); // Switch to Simple Mode
window.__testHelpers.setInstrumental(false);

// Check form validity
window.__testHelpers.isFormValid(); // Returns true/false

// Get current form state
window.__testHelpers.getFormState();
// Returns: { songDescription, lyrics, style, customMode, instrumental, isFormValid }
```

**Test IDs for element selection:**

```javascript
// Use data-testid when you need to query elements
document.querySelector('[data-testid="song-description-input"]')
document.querySelector('[data-testid="lyrics-input"]')
document.querySelector('[data-testid="style-input"]')
document.querySelector('[data-testid="create-button"]')
```

**When you encounter this:**
1. **Use window.__testHelpers** to set form values and trigger React state
2. **Use data-testid** attributes to find elements
3. **Use mcp_io_github_chr_evaluate_script** to run JavaScript that calls test helpers

When testing UI with browser automation tools:

1.  **Always take snapshot first** - `mcp_io_github_chr_take_snapshot()` provides element UIDs
2.  **Use UID-based clicks** - React's virtual DOM makes querySelector unreliable
3.  **Use test helpers for form input** - `window.__testHelpers.setSongDescription(...)` triggers React
4.  **Error toasts disappear fast** - They vanish before screenshots capture them
5.  **Use console messages** - `mcp_io_github_chr_list_console_messages()` persists errors
6.  **Check backend logs in real-time** - Frontend errors may originate from backend

**Example testing workflow:**

```bash
# 1. Navigate to app
mcp_io_github_chr_navigate_page(url="http://localhost:3000")

# 2. Set form values using test helpers
mcp_io_github_chr_evaluate_script(
  expression="window.__testHelpers.setSongDescription('A cheerful pop song about coding'); window.__testHelpers.isFormValid();"
)

# 3. Take snapshot to get Create button UID
mcp_io_github_chr_take_snapshot()  # Returns uid=13_150 for Create button

# 4. Click Create button using UID
mcp_io_github_chr_click(uid=13_150)

# 5. Check console for errors (toasts disappear too fast)
mcp_io_github_chr_list_console_messages()

# 6. Check backend logs for server-side errors
tail -f <backend_log_file>
```

### Backend Log Monitoring

**Backend logs are essential for debugging generation flow:**

When `start-all.bat` launches services in separate CMD windows, logs appear there.For programmatic monitoring:

```bash
# If backend redirected to file
tail -f /tmp/backend.log

# Key patterns to grep:
grep "Using Gradio" backend.log          # Confirms Gradio client used (not Python spawn)
grep "Gradio args[11]" backend.log       # Shows duration parameter value
grep "Generation failed" backend.log     # Shows errors from Gradio/Python spawn
grep "Job job_" backend.log              # Tracks job lifecycle
```

**Common backend log indicators:**

-   `Using Gradio /generation_wrapper` - ✅ Correct path (Gradio client working)
-   `Using Python spawn (Gradio not available)` - ❌ Fallback mode (check `isGradioAvailable()`)
-   `spawn C:\Projects\ace-step-ui\ACE-Step-1.5...ENOENT` - ❌ ACESTEP_PATH wrong or not set

### Generation Not Working?

**Step-by-step diagnosis:**

1.  **Verify Gradio API is reachable:**
    
    ```bash
    curl -s http://localhost:8001/gradio_api/info
    # Should return JSON with {"named_endpoints": ...}
    ```
    
2.  **Check backend config:**
    
    ```bash
    # Verify ACESTEP_API_URL in server/.env
    cat server/.env | grep ACESTEP_API_URL
    # Should show: ACESTEP_API_URL=http://localhost:8001
    ```
    
3.  **Check ACESTEP_PATH (for Python spawn fallback):**
    
    ```bash
    # If you see "spawn ...ENOENT" errors, ACESTEP_PATH is wrong
    # Set it before starting backend:
    export ACESTEP_PATH=C:\Users\{Username}\pinokio\api\ace-step-ui.pinokio.git\app\ACE-Step-1.5
    ```
    
4.  **Monitor backend for Gradio detection:**
    
    ```bash
    # Backend checks isGradioAvailable() - if it fails, falls back to Python spawn
    # Check backend logs for "Using Gradio" vs "Using Python spawn"
    ```
    
5.  **Check frontend console messages:**
    
    ```javascript
    // Error toasts disappear in ~3 seconds
    // Console messages persist - always check them
    mcp_io_github_chr_list_console_messages()
    ```
6.  **Verify required fields:**
    
    -   Simple mode: `songDescription` required
    -   Custom mode: `style`, `lyrics`, OR `referenceAudioUrl` required

**Common error patterns:**

-   `400: Song description required for simple mode` - Fill "DESCRIBE YOUR SONG" field
-   `400: Style, lyrics, or reference audio required for custom mode` - Add at least one
-   `spawn ...ENOENT` - ACESTEP_PATH not set or incorrect
-   `Gradio not available` - Check `http://localhost:8001/gradio_api/info` endpoint

### Audio Not Playing?

1.  Check file exists: `server/public/audio/{songId}.mp3`
2.  Check browser console for CORS errors
3.  Verify Vite proxy in `vite.config.ts` routes `/audio` to port 3001

### Database Issues?

1.  SQLite file: `server/data/db.sqlite` (created on first run)
2.  Migrations run automatically on server start
3.  Reset: Delete `server/data/db.sqlite` and restart server

### Environment Configuration Issues

**ACESTEP_PATH is critical but easy to misconfigure:**

```bash
# ❌ WRONG: Backend started without ACESTEP_PATH
cd server && npm run dev
# Falls back to ../ACE-Step-1.5 which may not exist

# ✅ CORRECT: Set before starting
export ACESTEP_PATH=/c/Users/$USER/pinokio/api/ace-step-ui.pinokio.git/app/ACE-Step-1.5
cd server && npm run dev

# ✅ BEST: Use start-all.bat which sets it automatically
set ACESTEP_PATH=C:\Users\%USERNAME%\pinokio\api\ace-step-ui.pinokio.git\app\ACE-Step-1.5
start-all.bat
```

**What uses ACESTEP_PATH:**

The environment variable is used by:
- `server/src/config/index.ts` - Datasets directory paths
- `server/src/services/acestep.ts` - Python executable resolution
- `server/src/routes/generate.ts` - Format and health check scripts

All code uses `resolveAceStepPath()` which:
1. Checks `process.env.ACESTEP_PATH` first
2. Falls back to `../ACE-Step-1.5` (relative to workspace root)

**Verify environment in running backend:**

```bash
# The config now dynamically resolves ACESTEP_PATH# If not set, it defaults to ../ACE-Step-1.5# Check logs during startup for "Using Python at: ..." to see resolved path
```