# Startup Scripts

This directory contains specialized startup scripts for ACE-Step UI. For most users, the scripts in the **root directory** (`start-all.bat`, `start-all.sh`) are recommended.

## Scripts Overview

### Production Mode (Built Frontend)

| Script | Platform | Purpose |
|--------|----------|---------|
| `start-pinokio.bat` | Windows | Start with Pinokio ACE-Step installation |
| `start-pinokio.sh` | Linux/macOS | Start with Pinokio ACE-Step installation |

These scripts automatically set `ACESTEP_PATH` to the Pinokio installation location and run `start-all.bat/sh`.

### Development Mode (Hot Reload)

| Script | Platform | Purpose |
|--------|----------|---------|
| `start-pinokio-dev.bat` | Windows | Dev mode with Pinokio installation |
| `start-pinokio-dev.sh` | Linux/macOS | Dev mode with Pinokio installation |
| `start-dev.bat` | Windows | Dev mode with auto-detected ACE-Step |
| `start-dev.sh` | Linux/macOS | Dev mode with auto-detected ACE-Step |

Development mode provides:
- **Hot reload** - instant updates when you edit code
- **Source maps** - easier debugging
- **Live logs** - separate terminal windows for each service

## Usage

### Pinokio Users (Easiest)

**Production:**
```bash
# Windows
scripts\start-pinokio.bat

# Linux/macOS
./scripts/start-pinokio.sh
```

**Development:**
```bash
# Windows
scripts\start-pinokio-dev.bat

# Linux/macOS
./scripts/start-pinokio-dev.sh
```

### Other Installations

**Production:**
Use `start-all.bat` or `start-all.sh` from the root directory.

**Development:**
```bash
# Windows
set ACESTEP_PATH=C:\path\to\ACE-Step-1.5
scripts\start-dev.bat

# Linux/macOS
export ACESTEP_PATH=/path/to/ACE-Step-1.5
./scripts/start-dev.sh
```

## Port Assignments

All scripts use the same ports:
- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:3001
- **ACE-Step API:** http://localhost:8001

## Stopping Services

Close the CMD/terminal windows opened by the scripts, or:
- **Windows:** Press Ctrl+C in each window
- **Linux/macOS:** Press Ctrl+C (dev scripts handle cleanup automatically)
