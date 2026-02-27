# OpenClaw Doctor

Automatically diagnoses common OpenClaw errors and provides actionable fixes for developers and agents.

## Installation

```bash
npm install
```

## Usage

### Error Code Lookup

```bash
node scripts/doctor.js --error-code ERR_CONFIG_01
```

### Log File Analysis

```bash
node scripts/doctor.js --log-file /path/to/openclaw.log
```

### Symptom-Based Diagnosis

```bash
node scripts/doctor.js --symptoms "agent crash timeout"
```

### System Health Check

```bash
node scripts/doctor.js --health-check
```

### JSON Output

Add `--json` to any command for machine-readable output:

```bash
node scripts/doctor.js --error-code ERR_AGENT_01 --json
```

## Error Categories

| Category       | Error Codes              | Description                          |
|----------------|--------------------------|--------------------------------------|
| Configuration  | ERR_CONFIG_01-03         | Config file issues                   |
| Skill          | ERR_SKILL_01-03          | Skill loading and execution          |
| Agent          | ERR_AGENT_01-03          | Agent session and communication      |
| Runtime        | ERR_SIGNAL_01, ERR_MEMORY_07 | Process signals and memory       |
| Installation   | ERR_INSTALL_01-02        | Node.js and npm issues               |
| Permission     | ERR_PERMISSION_01        | File and directory access             |
| Network        | ERR_NETWORK_01-02        | Connectivity and rate limits          |
| Session        | ERR_SESSION_01-02        | Session state and limits              |
| Tool           | ERR_TOOL_01-02           | Tool execution and registration       |

## Agent Integration

```javascript
const { createDiagnosticTask, formatForAgent } = require('./scripts/integration');

const task = createDiagnosticTask({
  errorCode: 'ERR_CONFIG_01',
  context: { projectPath: '/my/project' }
});

// Use with agent workflow
const agentInstructions = formatForAgent(diagnosisResult);
```

## Running Tests

```bash
npm test
```

## License

MIT
