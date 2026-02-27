#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const analyzer = require("./analyzer");

const HELP_TEXT = `
openclaw-doctor - Diagnose common OpenClaw errors and suggest fixes

USAGE:
  node doctor.js [OPTIONS]

OPTIONS:
  --error-code <CODE>   Look up a specific error code (e.g., ERR_CONFIG_01)
  --log-file <PATH>     Analyze an OpenClaw log file for errors
  --symptoms <TEXT>      Describe symptoms to find matching errors
  --health-check        Run a system health check
  --list-errors         List all known error codes
  --json                Output results as JSON instead of formatted text
  --help                Show this help message

EXAMPLES:
  node doctor.js --error-code ERR_CONFIG_01
  node doctor.js --log-file /var/log/openclaw/agent.log
  node doctor.js --symptoms "agent crash timeout memory"
  node doctor.js --health-check
  node doctor.js --list-errors --json
`.trim();

/**
 * Parse command line arguments into a structured options object.
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    errorCode: null,
    logFile: null,
    symptoms: null,
    healthCheck: false,
    listErrors: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--error-code":
        options.errorCode = args[++i] || null;
        break;
      case "--log-file":
        options.logFile = args[++i] || null;
        break;
      case "--symptoms":
        options.symptoms = args[++i] || null;
        break;
      case "--health-check":
        options.healthCheck = true;
        break;
      case "--list-errors":
        options.listErrors = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
    }
  }

  return options;
}

/**
 * Format a single diagnosis for CLI output.
 */
function formatDiagnosis(diag, index) {
  const lines = [];
  const prefix = index !== undefined ? `[${index + 1}] ` : "";
  const severityIcon =
    diag.severity === "critical"
      ? "!!!"
      : diag.severity === "high"
        ? "!!"
        : "!";

  lines.push(`${prefix}${severityIcon} ${diag.errorCode}: ${diag.title}`);
  lines.push(`   Severity: ${diag.severity || "unknown"}`);
  if (diag.confidence !== undefined) {
    lines.push(`   Confidence: ${(diag.confidence * 100).toFixed(1)}%`);
  }
  lines.push(`   ${diag.description}`);
  lines.push("");
  lines.push("   Fix steps:");
  for (const step of diag.fixSteps || []) {
    lines.push(`     -> ${step}`);
  }

  if (diag.matchedKeywords && diag.matchedKeywords.length > 0) {
    lines.push(`   Matched: ${diag.matchedKeywords.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Format health check results for CLI output.
 */
function formatHealthCheck(result) {
  const lines = [];
  const statusLabel =
    result.overallStatus === "healthy"
      ? "HEALTHY"
      : result.overallStatus === "degraded"
        ? "DEGRADED"
        : "UNHEALTHY";

  lines.push(`System Health: ${statusLabel}`);
  lines.push(
    `Checks: ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.warnings} warnings`
  );
  lines.push("");

  for (const check of result.checks) {
    const icon =
      check.status === "pass"
        ? "[PASS]"
        : check.status === "fail"
          ? "[FAIL]"
          : check.status === "warn"
            ? "[WARN]"
            : "[INFO]";
    lines.push(`  ${icon} ${check.name}: ${check.detail}`);
  }

  return lines.join("\n");
}

/**
 * Format a list of all known error codes for CLI output.
 */
function formatErrorList(codes) {
  const lines = [];
  lines.push("Known OpenClaw Error Codes:");
  lines.push("");

  const categories = {};
  for (const [code, info] of Object.entries(codes)) {
    const cat = info.category || "other";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({ code, ...info });
  }

  for (const [category, errors] of Object.entries(categories).sort()) {
    lines.push(`  ${category.toUpperCase()}`);
    for (const err of errors) {
      lines.push(`    ${err.code}: ${err.title} (${err.severity})`);
    }
    lines.push("");
  }

  lines.push(`Total: ${Object.keys(codes).length} error codes`);
  return lines.join("\n");
}

/**
 * Main entry point. Parses arguments, runs the appropriate action, and outputs results.
 */
function main() {
  const options = parseArgs(process.argv);

  if (options.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Determine which action to take
  const hasAction =
    options.errorCode ||
    options.logFile ||
    options.symptoms ||
    options.healthCheck ||
    options.listErrors;

  if (!hasAction) {
    // Default to health check if no action specified
    options.healthCheck = true;
  }

  let result;
  let exitCode = 0;

  try {
    if (options.listErrors) {
      const codes = analyzer.loadErrorCodes();
      if (options.json) {
        console.log(JSON.stringify(codes, null, 2));
      } else {
        console.log(formatErrorList(codes));
      }
      return;
    }

    if (options.errorCode) {
      result = analyzer.lookupErrorCode(options.errorCode);
      if (!result) {
        const message = `Unknown error code: ${options.errorCode}. Use --list-errors to see all known codes.`;
        if (options.json) {
          console.log(JSON.stringify({ error: message }, null, 2));
        } else {
          console.error(message);
        }
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatDiagnosis(result));
      }
      return;
    }

    if (options.logFile) {
      if (!fs.existsSync(options.logFile)) {
        const message = `Log file not found: ${options.logFile}`;
        if (options.json) {
          console.log(JSON.stringify({ error: message }, null, 2));
        } else {
          console.error(message);
        }
        process.exit(1);
      }

      const logContent = fs.readFileSync(options.logFile, "utf-8");
      result = analyzer.analyzeLogFile(logContent);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Log Analysis: ${options.logFile}`);
        console.log(`Total lines: ${result.totalLines}`);
        console.log(`Error lines: ${result.errorLineCount}`);
        console.log("");

        if (result.diagnoses.length === 0) {
          console.log("No known error patterns detected in the log file.");
        } else {
          console.log(
            `Found ${result.diagnoses.length} potential issue(s):\n`
          );
          for (let i = 0; i < result.diagnoses.length; i++) {
            console.log(formatDiagnosis(result.diagnoses[i], i));
            console.log("");
          }
        }
        console.log(result.summary);
      }

      if (
        result.diagnoses.some(
          (d) => d.severity === "critical" || d.severity === "high"
        )
      ) {
        exitCode = 1;
      }
    }

    if (options.symptoms) {
      const matches = analyzer.analyzeText(options.symptoms);

      if (options.json) {
        console.log(JSON.stringify({ matches }, null, 2));
      } else {
        if (matches.length === 0) {
          console.log(
            "No matching error patterns found for the given symptoms."
          );
          console.log(
            "Try different keywords or use --list-errors to browse known errors."
          );
        } else {
          console.log(
            `Symptom Analysis: Found ${matches.length} matching error(s)\n`
          );
          for (let i = 0; i < matches.length; i++) {
            console.log(formatDiagnosis(matches[i], i));
            console.log("");
          }
        }
      }
      return;
    }

    if (options.healthCheck) {
      result = analyzer.runHealthCheck();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatHealthCheck(result));
      }

      if (result.overallStatus === "unhealthy") {
        exitCode = 1;
      }
    }
  } catch (err) {
    const message = `Diagnostic error: ${err.message}`;
    if (options.json) {
      console.log(
        JSON.stringify({ error: message, stack: err.stack }, null, 2)
      );
    } else {
      console.error(message);
    }
    process.exit(2);
  }

  process.exit(exitCode);
}

// Export for testing
module.exports = { parseArgs, formatDiagnosis, formatHealthCheck, formatErrorList, main };

// Run if called directly
if (require.main === module) {
  main();
}
