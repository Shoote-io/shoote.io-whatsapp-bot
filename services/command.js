
// =====================================================
// NEXUS COMMAND PARSER
// =====================================================

import crypto from "node:crypto";

const PARSER_VERSION = "2.1.0";

const NEXUS_INTENTS = new Set([
  "machine",
  "run",
  "install",
  "start"
]);

// =====================================================
// NORMALIZE
// =====================================================

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/_/g, "-")
    .replace(/\./g, "-");
}

// =====================================================
// TOKENIZE
// =====================================================

function tokenize(text) {
  return normalize(text)
    .split(" ")
    .filter(Boolean);
}

// =====================================================
// INSTALL PARSER
// =====================================================

function parseInstall(tokens, raw, normalized) {

  /*
   * install update engine
   *
   * intent    = install
   * operation = install
   * resource  = update
   * extension = engine
   *
   * install machine status
   *
   * intent    = install
   * operation = install
   * resource  = machine
   * extension = status
   */

  if (tokens.length < 3) {
    return null;
  }

  const extension = tokens.at(-1);

  const resource = tokens
    .slice(1, -1)
    .join(".");

  if (!resource || !extension) {
    return null;
  }

  return {
    intent: "install",
    operation: "install",
    target: resource,
    resource,
    extension,
    raw,
    normalized
  };
}

// =====================================================
// UNIVERSAL PARSER
// =====================================================

export function parseCommand(text) {

  if (typeof text !== "string") {
    return null;
  }

  const cleaned = normalize(text);
  const tokens = tokenize(cleaned);

  if (!tokens.length) {
    return null;
  }

  const intent = tokens[0];

  // ---------------------------------------------------
  // VALIDATE INTENT ONLY
  // ---------------------------------------------------

  if (!NEXUS_INTENTS.has(intent)) {
    return null;
  }

  // ---------------------------------------------------
  // INSTALL
  // ---------------------------------------------------

  if (intent === "install") {
    return parseInstall(
      tokens,
      text,
      cleaned
    );
  }

  // ---------------------------------------------------
  // NORMAL COMMAND
  // ---------------------------------------------------

  const operation =
    tokens.length >= 2
      ? tokens[1]
      : null;

  if (!operation) {
    return null;
  }

  const target =
    tokens.length >= 3
      ? tokens.slice(2).join("-")
      : null;

  return {
    intent,
    operation,
    target,
    resource: null,
    extension: null,
    raw: text,
    normalized: cleaned
  };
}

// =====================================================
// PERMISSIONS
// =====================================================

function resolvePermissions(parsed) {

  const permissions = {
    filesystem: false,
    network: false,
    shell: false,
    elevated: false
  };

  if (parsed.intent === "install") {
    permissions.filesystem = true;
    permissions.network = true;
  }

  if (
    parsed.intent === "run" ||
    parsed.intent === "start"
  ) {
    permissions.shell = true;
  }

  return permissions;
}

// =====================================================
// EXECUTION
// =====================================================

function resolveExecution(parsed) {

  const execution = {
    state: "queued",
    phase: "ingress",
    progress: 0,
    attempts: 0,
    max_attempts: 3,
    priority: "normal",
    mode: "async",
    timeout_seconds: 300
  };

  if (
    parsed.intent === "install" ||
    parsed.intent === "run"
  ) {
    execution.timeout_seconds = 1800;
  }

  return execution;
}

// =====================================================
// BUILD NEXUS COMMAND
// =====================================================

export function buildNexusCommand(parsed) {

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  if (
    !parsed.intent ||
    !NEXUS_INTENTS.has(parsed.intent)
  ) {
    return null;
  }

  if (
    !parsed.operation ||
    String(parsed.operation).trim() === ""
  ) {
    return null;
  }

  const now = new Date().toISOString();

  const commandId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();

  return {

    command_id: commandId,

    execution_id: null,

    correlation_id: correlationId,

    version: "2.1.0",

    created_at: now,

    updated_at: now,

    status: "pending",

    intent: parsed.intent,

    operation: parsed.operation,

    target: parsed.target || null,

    execution: resolveExecution(parsed),

    orchestration: {

      origin: "whatsapp",

      source: "kaya-nexus-operator",

      transport: "supabase",

      runtime: "elmidor-nexus",

      dispatch_strategy: "intent-contract",

      recovery_strategy: "retry"
    },

    permissions: resolvePermissions(parsed),

    payload: {

      raw: parsed.raw || null,

      normalized: parsed.normalized || null,

      arguments: {

        operation: parsed.operation,

        target: parsed.target || null,

        resource: parsed.resource || null,

        extension: parsed.extension || null
      },

      metadata: {

        parser: "nexus-operator-command-parser",

        parser_version: PARSER_VERSION
      }
    },

    result: {

      status: null,

      code: null,

      message: null,

      data: null,

      artifacts: []
    },

    state: {

      current: "queued",

      previous: null,

      history: [

        {
          state: "queued",

          timestamp: now
        }

      ]
    },

    telemetry: {

      heartbeat_at: null,

      started_at: null,

      completed_at: null,

      duration_ms: null,

      runtime_id: null,

      worker_id: null,

      machine_id: null
    },

    notes: [

      {
        level: "info",

        message:
          "Command accepted into orchestration queue.",

        timestamp: now
      }

    ]
  };
}
