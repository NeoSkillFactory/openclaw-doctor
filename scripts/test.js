#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const analyzer = require("./analyzer");
const integration = require("./integration");
const doctor = require("./doctor");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
  }
}

// ─── Analyzer Tests ─────────────────────────────────────────

console.log("\n=== Analyzer Tests ===");

test("loadErrorCodes returns an object with error codes", () => {
  const codes = analyzer.loadErrorCodes();
  assert.ok(typeof codes === "object");
  assert.ok(Object.keys(codes).length >= 20);
  assert.ok(codes["ERR_CONFIG_01"]);
  assert.ok(codes["ERR_AGENT_01"]);
});

test("loadSymptoms returns patterns array", () => {
  const symptoms = analyzer.loadSymptoms();
  assert.ok(symptoms.patterns);
  assert.ok(Array.isArray(symptoms.patterns));
  assert.ok(symptoms.patterns.length >= 20);
});

test("lookupErrorCode finds known code", () => {
  const result = analyzer.lookupErrorCode("ERR_CONFIG_01");
  assert.ok(result);
  assert.strictEqual(result.errorCode, "ERR_CONFIG_01");
  assert.strictEqual(result.title, "Missing configuration file");
  assert.ok(Array.isArray(result.fixSteps));
  assert.ok(result.fixSteps.length > 0);
});

test("lookupErrorCode is case-insensitive", () => {
  const result = analyzer.lookupErrorCode("err_config_01");
  assert.ok(result);
  assert.strictEqual(result.errorCode, "ERR_CONFIG_01");
});

test("lookupErrorCode returns null for unknown code", () => {
  const result = analyzer.lookupErrorCode("ERR_NONEXIST_99");
  assert.strictEqual(result, null);
});

test("analyzeText matches timeout symptoms", () => {
  const matches = analyzer.analyzeText("agent timed out waiting for response");
  assert.ok(matches.length > 0);
  const timeoutMatch = matches.find((m) => m.errorCode === "ERR_AGENT_02");
  assert.ok(timeoutMatch, "Should find ERR_AGENT_02 for timeout symptoms");
  assert.ok(timeoutMatch.confidence > 0);
});

test("analyzeText matches config symptoms", () => {
  const matches = analyzer.analyzeText("configuration not found");
  assert.ok(matches.length > 0);
  const configMatch = matches.find((m) => m.errorCode === "ERR_CONFIG_01");
  assert.ok(configMatch, "Should find ERR_CONFIG_01 for config not found");
});

test("analyzeText matches permission symptoms", () => {
  const matches = analyzer.analyzeText("permission denied EACCES");
  assert.ok(matches.length > 0);
  const permMatch = matches.find((m) => m.errorCode === "ERR_PERMISSION_01");
  assert.ok(permMatch, "Should find ERR_PERMISSION_01");
});

test("analyzeText returns empty for unrelated text", () => {
  const matches = analyzer.analyzeText("everything is working fine");
  assert.strictEqual(matches.length, 0);
});

test("analyzeText results are sorted by confidence descending", () => {
  const matches = analyzer.analyzeText("agent crash timeout fatal error");
  assert.ok(matches.length >= 2);
  for (let i = 1; i < matches.length; i++) {
    assert.ok(
      matches[i - 1].confidence >= matches[i].confidence,
      `Match ${i - 1} confidence (${matches[i - 1].confidence}) should be >= match ${i} confidence (${matches[i].confidence})`
    );
  }
});

test("analyzeLogFile processes log content", () => {
  const logContent = [
    "2026-01-01 [INFO] Starting agent",
    "2026-01-01 [ERROR] Config not found: missing config",
    "2026-01-01 [INFO] Retrying...",
    '2026-01-01 [ERROR] Permission denied accessing /tmp/data',
    "2026-01-01 [INFO] Done",
  ].join("\n");

  const result = analyzer.analyzeLogFile(logContent);
  assert.ok(result.totalLines === 5);
  assert.ok(result.errorLineCount === 2);
  assert.ok(result.diagnoses.length > 0);
  assert.ok(typeof result.summary === "string");
});

test("analyzeLogFile detects explicit error codes in logs", () => {
  const logContent = "2026-01-01 [ERROR] ERR_SKILL_01: Skill not found";
  const result = analyzer.analyzeLogFile(logContent);
  assert.ok(result.diagnoses.length > 0);
  const skillMatch = result.diagnoses.find(
    (d) => d.errorCode === "ERR_SKILL_01"
  );
  assert.ok(skillMatch, "Should detect ERR_SKILL_01 from explicit code in log");
});

test("analyzeLogFile handles empty log", () => {
  const result = analyzer.analyzeLogFile("");
  assert.strictEqual(result.totalLines, 0);
  assert.strictEqual(result.errorLineCount, 0);
  assert.strictEqual(result.diagnoses.length, 0);
});

test("runHealthCheck returns structured result", () => {
  const result = analyzer.runHealthCheck();
  assert.ok(result.timestamp);
  assert.ok(["healthy", "degraded", "unhealthy"].includes(result.overallStatus));
  assert.ok(Array.isArray(result.checks));
  assert.ok(result.checks.length >= 3);
  assert.ok(typeof result.summary.total === "number");
  assert.ok(typeof result.summary.passed === "number");
});

test("runHealthCheck passes on Node >= 18", () => {
  const result = analyzer.runHealthCheck();
  const nodeCheck = result.checks.find((c) => c.name === "Node.js version");
  assert.ok(nodeCheck);
  assert.strictEqual(nodeCheck.status, "pass");
});

test("generateSummary with empty diagnoses", () => {
  const summary = analyzer.generateSummary([]);
  assert.strictEqual(summary, "No known error patterns detected.");
});

test("generateSummary with mixed severities", () => {
  const diagnoses = [
    { severity: "critical", errorCode: "ERR_A" },
    { severity: "high", errorCode: "ERR_B" },
    { severity: "medium", errorCode: "ERR_C" },
  ];
  const summary = analyzer.generateSummary(diagnoses);
  assert.ok(summary.includes("3 potential issue(s)"));
  assert.ok(summary.includes("critical"));
  assert.ok(summary.includes("high"));
});

// ─── Doctor CLI Tests ───────────────────────────────────────

console.log("\n=== Doctor CLI Tests ===");

test("parseArgs parses --error-code", () => {
  const opts = doctor.parseArgs(["node", "doctor.js", "--error-code", "ERR_CONFIG_01"]);
  assert.strictEqual(opts.errorCode, "ERR_CONFIG_01");
});

test("parseArgs parses --log-file", () => {
  const opts = doctor.parseArgs(["node", "doctor.js", "--log-file", "/tmp/test.log"]);
  assert.strictEqual(opts.logFile, "/tmp/test.log");
});

test("parseArgs parses --symptoms", () => {
  const opts = doctor.parseArgs(["node", "doctor.js", "--symptoms", "timeout crash"]);
  assert.strictEqual(opts.symptoms, "timeout crash");
});

test("parseArgs parses --health-check", () => {
  const opts = doctor.parseArgs(["node", "doctor.js", "--health-check"]);
  assert.strictEqual(opts.healthCheck, true);
});

test("parseArgs parses --json flag", () => {
  const opts = doctor.parseArgs(["node", "doctor.js", "--health-check", "--json"]);
  assert.strictEqual(opts.json, true);
  assert.strictEqual(opts.healthCheck, true);
});

test("parseArgs parses --help", () => {
  const opts = doctor.parseArgs(["node", "doctor.js", "--help"]);
  assert.strictEqual(opts.help, true);
});

test("formatDiagnosis produces readable output", () => {
  const diag = {
    errorCode: "ERR_TEST_01",
    title: "Test Error",
    severity: "high",
    confidence: 0.85,
    description: "A test error description",
    fixSteps: ["Step 1", "Step 2"],
    matchedKeywords: ["test"],
  };
  const output = doctor.formatDiagnosis(diag, 0);
  assert.ok(output.includes("ERR_TEST_01"));
  assert.ok(output.includes("Test Error"));
  assert.ok(output.includes("85.0%"));
  assert.ok(output.includes("Step 1"));
  assert.ok(output.includes("Step 2"));
});

test("formatHealthCheck produces readable output", () => {
  const result = {
    overallStatus: "healthy",
    checks: [
      { name: "Test Check", status: "pass", detail: "OK" },
    ],
    summary: { total: 1, passed: 1, failed: 0, warnings: 0 },
  };
  const output = doctor.formatHealthCheck(result);
  assert.ok(output.includes("HEALTHY"));
  assert.ok(output.includes("[PASS]"));
});

test("CLI --help exits with code 0", () => {
  const doctorPath = path.join(__dirname, "doctor.js");
  const result = execFileSync("node", [doctorPath, "--help"], {
    encoding: "utf-8",
  });
  assert.ok(result.includes("openclaw-doctor"));
  assert.ok(result.includes("--error-code"));
});

test("CLI --error-code with valid code outputs diagnosis", () => {
  const doctorPath = path.join(__dirname, "doctor.js");
  const result = execFileSync(
    "node",
    [doctorPath, "--error-code", "ERR_SKILL_01", "--json"],
    { encoding: "utf-8" }
  );
  const parsed = JSON.parse(result);
  assert.strictEqual(parsed.errorCode, "ERR_SKILL_01");
  assert.ok(parsed.fixSteps.length > 0);
});

test("CLI --error-code with unknown code exits with code 1", () => {
  const doctorPath = path.join(__dirname, "doctor.js");
  try {
    execFileSync("node", [doctorPath, "--error-code", "ERR_FAKE_99", "--json"], {
      encoding: "utf-8",
    });
    assert.fail("Should have exited with code 1");
  } catch (err) {
    assert.strictEqual(err.status, 1);
  }
});

test("CLI --health-check --json returns valid JSON", () => {
  const doctorPath = path.join(__dirname, "doctor.js");
  const result = execFileSync(
    "node",
    [doctorPath, "--health-check", "--json"],
    { encoding: "utf-8" }
  );
  const parsed = JSON.parse(result);
  assert.ok(parsed.overallStatus);
  assert.ok(parsed.checks);
});

// ─── Integration Tests ──────────────────────────────────────

console.log("\n=== Integration Tests ===");

test("createDiagnosticTask with errorCode", () => {
  const task = integration.createDiagnosticTask({ errorCode: "ERR_CONFIG_01" });
  assert.strictEqual(task.skill, "openclaw-doctor");
  assert.strictEqual(task.action, "lookup");
  assert.strictEqual(task.parameters.errorCode, "ERR_CONFIG_01");
});

test("createDiagnosticTask with logFile", () => {
  const task = integration.createDiagnosticTask({ logFile: "/tmp/test.log" });
  assert.strictEqual(task.action, "analyze-log");
  assert.strictEqual(task.parameters.logFile, "/tmp/test.log");
});

test("createDiagnosticTask with symptoms", () => {
  const task = integration.createDiagnosticTask({ symptoms: "crash timeout" });
  assert.strictEqual(task.action, "analyze-symptoms");
});

test("createDiagnosticTask with no options", () => {
  const task = integration.createDiagnosticTask();
  assert.strictEqual(task.action, "diagnose");
  assert.ok(task.createdAt);
});

test("formatForAgent with null diagnosis", () => {
  const result = integration.formatForAgent(null);
  assert.strictEqual(result.status, "no-diagnosis");
  assert.ok(result.message);
});

test("formatForAgent with single error lookup", () => {
  const diag = analyzer.lookupErrorCode("ERR_CONFIG_01");
  const result = integration.formatForAgent(diag);
  assert.strictEqual(result.status, "diagnosed");
  assert.strictEqual(result.errorCode, "ERR_CONFIG_01");
  assert.ok(result.actions.length > 0);
  assert.ok(result.actions[0].order === 1);
});

test("formatForAgent with log analysis result", () => {
  const logResult = analyzer.analyzeLogFile(
    "2026-01-01 [ERROR] Permission denied EACCES"
  );
  const result = integration.formatForAgent(logResult);
  assert.strictEqual(result.status, "analyzed");
  assert.ok(typeof result.issueCount === "number");
});

test("formatForAgent with health check result", () => {
  const healthResult = analyzer.runHealthCheck();
  const result = integration.formatForAgent(healthResult);
  assert.ok(["healthy", "degraded", "unhealthy"].includes(result.status));
  assert.ok(result.message);
  assert.ok(result.healthSummary);
});

test("generateSubagentParams returns valid structure", () => {
  const diag = analyzer.lookupErrorCode("ERR_AGENT_01");
  const params = integration.generateSubagentParams(diag);
  assert.strictEqual(params.task, "apply-fix");
  assert.strictEqual(params.skill, "openclaw-doctor");
  assert.ok(params.parameters.actions.length > 0);
  assert.ok(params.options.timeout > 0);
});

test("handleAgentMessage with diagnose-error action", () => {
  const result = integration.handleAgentMessage({
    action: "diagnose-error",
    payload: { errorCode: "ERR_SKILL_02" },
  });
  assert.strictEqual(result.status, "diagnosed");
  assert.strictEqual(result.errorCode, "ERR_SKILL_02");
});

test("handleAgentMessage with health-check action", () => {
  const result = integration.handleAgentMessage({
    action: "health-check",
    payload: {},
  });
  assert.ok(["healthy", "degraded", "unhealthy"].includes(result.status));
});

test("handleAgentMessage with analyze-symptoms action", () => {
  const result = integration.handleAgentMessage({
    action: "analyze-symptoms",
    payload: { text: "npm install dependency ERESOLVE" },
  });
  assert.strictEqual(result.status, "analyzed");
  assert.ok(result.allIssues.length > 0);
});

test("handleAgentMessage with unknown action", () => {
  const result = integration.handleAgentMessage({
    action: "unknown-action",
    payload: {},
  });
  assert.strictEqual(result.status, "error");
  assert.ok(result.message.includes("Unknown action"));
});

// ─── Error Code Coverage Test ───────────────────────────────

console.log("\n=== Coverage Tests ===");

test("all error codes have required fields", () => {
  const codes = analyzer.loadErrorCodes();
  for (const [id, info] of Object.entries(codes)) {
    assert.ok(info.title, `${id} missing title`);
    assert.ok(info.description, `${id} missing description`);
    assert.ok(Array.isArray(info.fixSteps), `${id} missing fixSteps`);
    assert.ok(info.fixSteps.length > 0, `${id} has empty fixSteps`);
    assert.ok(info.severity, `${id} missing severity`);
    assert.ok(info.category, `${id} missing category`);
    assert.ok(
      typeof info.confidenceThreshold === "number",
      `${id} missing confidenceThreshold`
    );
  }
});

test("all symptom patterns have required fields", () => {
  const symptoms = analyzer.loadSymptoms();
  for (let i = 0; i < symptoms.patterns.length; i++) {
    const p = symptoms.patterns[i];
    assert.ok(
      Array.isArray(p.keywords) && p.keywords.length > 0,
      `Pattern ${i} missing keywords`
    );
    assert.ok(
      Array.isArray(p.errorIDs) && p.errorIDs.length > 0,
      `Pattern ${i} missing errorIDs`
    );
    assert.ok(
      Array.isArray(p.recommendedTests),
      `Pattern ${i} missing recommendedTests`
    );
  }
});

test("all symptom errorIDs reference valid error codes", () => {
  const codes = analyzer.loadErrorCodes();
  const symptoms = analyzer.loadSymptoms();
  for (const pattern of symptoms.patterns) {
    for (const errorID of pattern.errorIDs) {
      assert.ok(
        codes[errorID],
        `Symptom references unknown error code: ${errorID}`
      );
    }
  }
});

test("at least 20 error patterns covered", () => {
  const codes = analyzer.loadErrorCodes();
  assert.ok(
    Object.keys(codes).length >= 20,
    `Expected >= 20 error codes, got ${Object.keys(codes).length}`
  );
});

// ─── Summary ────────────────────────────────────────────────

console.log("\n" + "=".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.error}`);
  }
}
console.log("=".repeat(50));

process.exit(failed > 0 ? 1 : 0);
