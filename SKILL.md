---
name: openclaw-doctor
description: Automatically diagnoses common OpenClaw errors and provides actionable fixes for developers and agents.
version: 1.0.0
author: OpenClaw Skill Factory
tags:
  - diagnostics
  - error-handling
  - troubleshooting
  - agent-support
triggers:
  - "My OpenClaw agent keeps failing"
  - "Diagnose why my skill isn't loading"
  - "Fix this OpenClaw configuration issue"
  - "Help me troubleshoot this agent error"
  - "What's wrong with my OpenClaw setup?"
  - "Automatically fix this OpenClaw error"
---

# openclaw-doctor

## 1. Overview

OpenClaw Doctor is a diagnostic skill that analyzes OpenClaw errors and provides actionable fixes. It supports error code lookup, log file analysis, and symptom-based diagnosis to quickly resolve common issues.

### Core Capabilities

- **Error Code Lookup**: Instantly retrieve fix instructions for known error codes
- **Log Analysis**: Parse OpenClaw log files to identify error patterns
- **Symptom Matching**: Describe symptoms in plain text to find matching errors
- **Confidence Scoring**: Each diagnosis includes a confidence score for reliability
- **Diagnostic Reports**: Generate comprehensive JSON reports with system health info
- **Agent Integration**: Seamless integration with OpenClaw agent workflows

### Trigger Scenarios

- "My OpenClaw agent keeps failing with error X"
- "Diagnose why my skill isn't loading"
- "Fix this OpenClaw configuration issue"
- "Help me troubleshoot this agent error"
- "What's wrong with my OpenClaw setup?"

## 2. Dependencies

### Files Required

- `scripts/doctor.js` - Main CLI tool and entry point
- `scripts/analyzer.js` - Error analysis and pattern matching engine
- `scripts/integration.js` - Agent workflow integration helpers
- `references/error-codes.json` - Database of error codes and fixes
- `references/symptoms.json` - Symptom-to-error mapping patterns

### Runtime Environment

- Node.js >= 18
- No external npm dependencies required (uses only built-in modules)

## 3. Usage Examples

### CLI Usage

```bash
# Look up a specific error code
node scripts/doctor.js --error-code ERR_CONFIG_01

# Analyze a log file
node scripts/doctor.js --log-file /path/to/openclaw.log

# Describe symptoms for diagnosis
node scripts/doctor.js --symptoms "agent crash timeout"

# Run a full system health check
node scripts/doctor.js --health-check

# Output as JSON
node scripts/doctor.js --error-code ERR_AGENT_01 --json
```

### Agent Integration

```javascript
const { createDiagnosticTask } = require('./scripts/integration');

// Create a diagnostic task for agent spawning
const task = createDiagnosticTask({
  errorCode: 'ERR_CONFIG_01',
  context: { projectPath: '/my/project' }
});
```

## 4. Metadata

- **Category**: Developer Tools / Diagnostics
- **License**: MIT
- **Repository**: OpenClaw Skill Factory
- **Error Database**: 20 common error patterns covered
- **Symptom Patterns**: 20 symptom-to-error mappings
