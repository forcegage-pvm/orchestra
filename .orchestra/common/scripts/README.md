# Orchestra Common Scripts

This folder contains shared utility scripts used by both orchestrator and implementor roles.

## Scripts

### set-env.ps1

Sets up environment variables and paths for Orchestra scripts. Should be sourced at the start of any script:

```powershell
. .\.orchestra\common\scripts\set-env.ps1
```

### check-utils.ps1

Common utility functions for validation and checking.

## Usage

All scripts assume they are run from the **project root** (tools/orchestra/).
