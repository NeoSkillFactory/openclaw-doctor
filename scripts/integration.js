#!/usr/bin/env node
"use strict";

const analyzer = require("./analyzer");

/**
 * Create a diagnostic task object suitable for agent session spawning.
 * This generates the parameters needed for sessions_spawn with task="openclaw-doctor".
 */
function createDiagnosticTask(options) {
  const { errorCode, logFile, symptoms, context } = options || {};

  const task = {
    skill: "openclaw-doctor",
    action: "diagnose",
    parameters: {},
    context: context || {},
    createdAt: new Date().toISOString(),
  };

  if (errorCode) {
    task.parameters.errorCode = errorCode;
    task.action = "lookup";
  }
  if (logFile) {
    task.parameters.logFile = logFile;
    task.action = "analyze-log";
  }
  if (symptoms) {
    task.parameters.symptoms = symptoms;
    task.action = "analyze-symptoms";
  }

  return task;
}

/**
 * Format a diagnosis result into agent-ready instructions.
 * Returns a structured object that agents can parse and act upon.
 */
function formatForAgent(diagnosis) {
  if (!diagnosis) {
    return {
      status: "no-diagnosis",
      message: "No diagnosis available. Please provide error details.",
      actions: [],
    };
  }

  // Handle single error lookup result
  if (diagnosis.errorCode && diagnosis.fixSteps) {
    return {
      status: "diagnosed",
      errorCode: diagnosis.errorCode,
      title: diagnosis.title,
      severity: diagnosis.severity || "unknown",
      confidence: diagnosis.confidence || diagnosis.confidenceThreshold || 0,
      message: diagnosis.description,
      actions: diagnosis.fixSteps.map((step, i) => ({
        order: i + 1,
        instruction: step,
        type: "manual",
      })),
      metadata: {
        category: diagnosis.category,
        recommendedTests: diagnosis.recommendedTests || [],
      },
    };
  }

  // Handle log analysis result with multiple diagnoses
  if (diagnosis.diagnoses && Array.isArray(diagnosis.diagnoses)) {
    const primary = diagnosis.diagnoses[0];
    return {
      status: "analyzed",
      issueCount: diagnosis.diagnoses.length,
      errorLineCount: diagnosis.errorLineCount || 0,
      primary: primary
        ? {
            errorCode: primary.errorCode,
            title: primary.title,
            severity: primary.severity,
            confidence: primary.confidence,
          }
        : null,
      actions: primary
        ? primary.fixSteps.map((step, i) => ({
            order: i + 1,
            instruction: step,
            type: "manual",
          }))
        : [],
      allIssues: diagnosis.diagnoses.map((d) => ({
        errorCode: d.errorCode,
        title: d.title,
        severity: d.severity,
        confidence: d.confidence,
      })),
      summary: diagnosis.summary,
    };
  }

  // Handle health check result
  if (diagnosis.overallStatus && diagnosis.checks) {
    const failedChecks = diagnosis.checks.filter((c) => c.status === "fail");
    return {
      status: diagnosis.overallStatus,
      message: `System health: ${diagnosis.overallStatus}. ${diagnosis.summary.passed}/${diagnosis.summary.total} checks passed.`,
      actions: failedChecks.map((c, i) => ({
        order: i + 1,
        instruction: `Fix: ${c.name} - ${c.detail}`,
        type: "manual",
        errorCode: c.errorCode,
      })),
      healthSummary: diagnosis.summary,
    };
  }

  return {
    status: "unknown",
    message: "Unrecognized diagnosis format.",
    actions: [],
  };
}

/**
 * Generate subagent spawn parameters for automated fix attempts.
 * Returns parameters that can be passed to sessions_spawn.
 */
function generateSubagentParams(diagnosis) {
  const agentFormat = formatForAgent(diagnosis);
  const manualActions = agentFormat.actions || [];

  return {
    task: "apply-fix",
    skill: "openclaw-doctor",
    parameters: {
      actions: manualActions,
      originalDiagnosis: {
        errorCode: agentFormat.errorCode || null,
        severity: agentFormat.severity || agentFormat.status,
        confidence: agentFormat.confidence || 0,
      },
    },
    options: {
      timeout: 30000,
      retryOnFailure: true,
      maxRetries: 2,
    },
  };
}

/**
 * Process incoming agent messages and route to appropriate diagnostic functions.
 * This is the main entry point for agent-to-skill communication.
 */
function handleAgentMessage(message) {
  const { action, payload } = message || {};

  switch (action) {
    case "diagnose-error": {
      const result = analyzer.lookupErrorCode(payload.errorCode || "");
      return formatForAgent(result);
    }
    case "analyze-log": {
      const result = analyzer.analyzeLogFile(payload.logContent || "");
      return formatForAgent(result);
    }
    case "analyze-symptoms": {
      const matches = analyzer.analyzeText(payload.text || "");
      return formatForAgent({
        diagnoses: matches,
        errorLineCount: 0,
        summary: analyzer.generateSummary(matches),
      });
    }
    case "health-check": {
      const result = analyzer.runHealthCheck();
      return formatForAgent(result);
    }
    default:
      return {
        status: "error",
        message: `Unknown action: ${action}. Supported: diagnose-error, analyze-log, analyze-symptoms, health-check`,
        actions: [],
      };
  }
}

module.exports = {
  createDiagnosticTask,
  formatForAgent,
  generateSubagentParams,
  handleAgentMessage,
};
