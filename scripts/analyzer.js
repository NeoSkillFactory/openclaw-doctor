#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const REFERENCES_DIR = path.join(__dirname, "..", "references");

/**
 * Load the error codes database from references/error-codes.json
 */
function loadErrorCodes() {
  const filePath = path.join(REFERENCES_DIR, "error-codes.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

/**
 * Load the symptoms database from references/symptoms.json
 */
function loadSymptoms() {
  const filePath = path.join(REFERENCES_DIR, "symptoms.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

/**
 * Look up a specific error code and return the full error entry.
 * Returns null if not found.
 */
function lookupErrorCode(errorCode) {
  const codes = loadErrorCodes();
  const normalized = errorCode.toUpperCase().trim();
  if (codes[normalized]) {
    return { errorCode: normalized, ...codes[normalized] };
  }
  return null;
}

/**
 * Analyze raw text (log content or error message) and match against symptom patterns.
 * Returns an array of matches sorted by confidence (highest first).
 */
function analyzeText(text) {
  const symptoms = loadSymptoms();
  const codes = loadErrorCodes();
  const textLower = text.toLowerCase();
  const matches = [];

  for (const pattern of symptoms.patterns) {
    const matchedKeywords = pattern.keywords.filter((kw) =>
      textLower.includes(kw.toLowerCase())
    );

    if (matchedKeywords.length === 0) continue;

    const keywordScore = matchedKeywords.length / pattern.keywords.length;

    for (const errorID of pattern.errorIDs) {
      const errorInfo = codes[errorID];
      if (!errorInfo) continue;

      const baseConfidence = errorInfo.confidenceThreshold || 0.5;
      const confidence = Math.min(
        1.0,
        baseConfidence * keywordScore + keywordScore * 0.2
      );

      const existing = matches.find((m) => m.errorCode === errorID);
      if (existing) {
        existing.confidence = Math.max(existing.confidence, confidence);
        existing.matchedKeywords = [
          ...new Set([...existing.matchedKeywords, ...matchedKeywords]),
        ];
      } else {
        matches.push({
          errorCode: errorID,
          title: errorInfo.title,
          description: errorInfo.description,
          severity: errorInfo.severity,
          category: errorInfo.category,
          confidence: parseFloat(confidence.toFixed(3)),
          matchedKeywords,
          fixSteps: errorInfo.fixSteps,
          recommendedTests: pattern.recommendedTests,
        });
      }
    }
  }

  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}

/**
 * Analyze a log file line by line and aggregate all diagnoses.
 * Returns a structured report with per-line and aggregated results.
 */
function analyzeLogFile(logContent) {
  const lines = logContent.split("\n").filter((l) => l.trim().length > 0);
  const allMatches = new Map();
  const errorLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isErrorLine =
      /\b(error|err|fatal|critical|fail|exception)\b/i.test(line);

    if (isErrorLine) {
      errorLines.push({ lineNumber: i + 1, content: line.trim() });

      // Check for explicit error codes in the line
      const codeMatch = line.match(/ERR_[A-Z]+_\d+/g);
      if (codeMatch) {
        for (const code of codeMatch) {
          const info = lookupErrorCode(code);
          if (info && !allMatches.has(code)) {
            allMatches.set(code, {
              ...info,
              confidence: info.confidenceThreshold || 0.9,
              source: "error-code-match",
              firstSeen: i + 1,
            });
          }
        }
      }

      // Also try symptom matching on the line
      const symptomMatches = analyzeText(line);
      for (const match of symptomMatches) {
        if (!allMatches.has(match.errorCode)) {
          allMatches.set(match.errorCode, {
            ...match,
            source: "symptom-match",
            firstSeen: i + 1,
          });
        }
      }
    }
  }

  const diagnoses = Array.from(allMatches.values()).sort(
    (a, b) => b.confidence - a.confidence
  );

  return {
    totalLines: lines.length,
    errorLineCount: errorLines.length,
    errorLines: errorLines.slice(0, 20), // cap at 20 for readability
    diagnoses,
    summary: generateSummary(diagnoses),
  };
}

/**
 * Run a basic system health check.
 * Checks Node.js version, important paths, and environment variables.
 */
function runHealthCheck() {
  const checks = [];

  // Node.js version check
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1).split(".")[0], 10);
  checks.push({
    name: "Node.js version",
    status: major >= 18 ? "pass" : "fail",
    detail:
      major >= 18
        ? `${nodeVersion} (OK)`
        : `${nodeVersion} (requires >= 18)`,
    errorCode: major >= 18 ? null : "ERR_INSTALL_01",
  });

  // Check references directory
  const refsExist =
    fs.existsSync(path.join(REFERENCES_DIR, "error-codes.json")) &&
    fs.existsSync(path.join(REFERENCES_DIR, "symptoms.json"));
  checks.push({
    name: "Reference databases",
    status: refsExist ? "pass" : "fail",
    detail: refsExist
      ? "error-codes.json and symptoms.json loaded"
      : "Reference files missing",
    errorCode: refsExist ? null : "ERR_CONFIG_01",
  });

  // Count known error codes
  let errorCodeCount = 0;
  let symptomPatternCount = 0;
  if (refsExist) {
    const codes = loadErrorCodes();
    const symptoms = loadSymptoms();
    errorCodeCount = Object.keys(codes).length;
    symptomPatternCount = symptoms.patterns.length;
  }
  checks.push({
    name: "Error database coverage",
    status: errorCodeCount >= 10 ? "pass" : "warn",
    detail: `${errorCodeCount} error codes, ${symptomPatternCount} symptom patterns`,
    errorCode: null,
  });

  // Check OPENCLAW_CONFIG environment variable
  const openclawConfig = process.env.OPENCLAW_CONFIG;
  checks.push({
    name: "OPENCLAW_CONFIG env",
    status: openclawConfig ? "pass" : "info",
    detail: openclawConfig || "Not set (using defaults)",
    errorCode: null,
  });

  // Memory check
  const memUsage = process.memoryUsage();
  const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  checks.push({
    name: "Memory usage",
    status: heapMB < 512 ? "pass" : "warn",
    detail: `${heapMB}MB heap used`,
    errorCode: heapMB >= 512 ? "ERR_MEMORY_07" : null,
  });

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;

  return {
    timestamp: new Date().toISOString(),
    overallStatus: failed > 0 ? "unhealthy" : warnings > 0 ? "degraded" : "healthy",
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
      warnings,
    },
  };
}

/**
 * Generate a human-readable summary from a list of diagnoses.
 */
function generateSummary(diagnoses) {
  if (diagnoses.length === 0) {
    return "No known error patterns detected.";
  }

  const critical = diagnoses.filter((d) => d.severity === "critical");
  const high = diagnoses.filter((d) => d.severity === "high");
  const other = diagnoses.filter(
    (d) => d.severity !== "critical" && d.severity !== "high"
  );

  const parts = [];
  if (critical.length > 0) {
    parts.push(
      `${critical.length} critical issue(s): ${critical.map((d) => d.errorCode).join(", ")}`
    );
  }
  if (high.length > 0) {
    parts.push(
      `${high.length} high-severity issue(s): ${high.map((d) => d.errorCode).join(", ")}`
    );
  }
  if (other.length > 0) {
    parts.push(`${other.length} other issue(s) detected`);
  }

  return `Found ${diagnoses.length} potential issue(s). ${parts.join(". ")}.`;
}

module.exports = {
  loadErrorCodes,
  loadSymptoms,
  lookupErrorCode,
  analyzeText,
  analyzeLogFile,
  runHealthCheck,
  generateSummary,
};
