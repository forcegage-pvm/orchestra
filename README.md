# Orchestra

AI Agent Task Orchestration - CLI, MCP Server, and VS Code Extension.

## Overview

Orchestra is a development workflow tool that prevents "implementation theater" - the failure mode where AI agents complete tasks without genuine functionality.

It implements a file-based orchestrator/implementor pattern with hidden verification criteria.

## Installation

```bash
npm install -g orchestra
```

## Usage

### CLI

```bash
# Initialize in your project
orchestra init

# Check status
orchestra status

# Prepare next task
orchestra prepare

# Verify completion
orchestra verify

# Complete task
orchestra complete -m "feat: implement feature"
```

### As Library

```typescript
import { loadManifest, runVerification } from 'orchestra';

const manifest = await loadManifest();
const result = await runVerification(taskId);
```

### MCP Server

```bash
orchestra mcp
```

## Project Structure

```
src/
├── core/           # Shared business logic
├── cli/            # CLI interface
├── mcp/            # MCP server interface
└── extension/      # VS Code extension
```

## Development

```bash
# Install dependencies
npm install

# Run CLI in dev mode
npm run dev -- status

# Run tests
npm test

# Build all
npm run build
```

## License

MIT
