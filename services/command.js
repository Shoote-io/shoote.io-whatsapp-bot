
import crypto from "node:crypto";

// ---------------------------------------------------------------------
// NEXUS OPERATOR COMMAND PARSER
// Version: 2.1.0
// Responsibility:
// - Normalize incoming WhatsApp commands.
// - Identify supported intents and operations.
// - Validate command structure.
// - Build a standardized Nexus command envelope.
// ---------------------------------------------------------------------

const PARSER_VERSION = "2.1.0";

const INTENTS = new Set([
  "machine",
  "run",
  "install",
  "update",
  "start"
]);

const OPERATIONS = {
  machine: new Set([
    "status",
    "environment",
    "identity"
  ]),

  run: new Set([
    "command",
    "task"
  ]),

  install: new Set([
    "machine",
    "update",
    "heartbeat",
    "listener",
    "queue",
    "runtime"
  ]),

  update: new Set([
    "engine",
    "runtime",
    "machine"
  ]),

  start: new Set([
    "media-processing",
    "heartbeat",
    "listener",
    "queue",
    "supervisor"
  ])
};

const DEFAULT_EXECUTION = {
  state: "queued",
  phase: "ingress",
  progress: 0,
  attempts: 0,
  max_attempts: 3,
  priority: "normal",
  mode: "async",
  timeout_seconds: 300
};

// ---------------------------------------------------------------------
// NORMALIZATION
// ---------------------------------------------------------------------

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[_\.]+/g, "-")
    .replace(/\s+/g, " ");
}

function tokenize(text) {
  return normalize(text)
    .split(" ")
    .filter(Boolean);
}

// ---------------------------------------------------------------------
// VALIDATION
// ---------------------------------------------------------------------

function validateOperation(intent, operation) {
  const allowed = OPERATIONS[intent];

  if (!allowed) {
    return false;
  }

  return allowed.has(operation);
}

function parseInstall(tokens, raw, normalized) {
  if (tokens.length < 2) {
    return null;
  }

  const resourceTokens = tokens.slice(1);

  // install heartbeat
  // install machine status
  // install update engine

  const extension = resourceTokens.at(-1);
  const resource = resourceTokens.slice(0, -1).join("-");

  if (!resource) {
    return null;
  }

  // For a single-token install target, treat it as the resource.
  if (resourceTokens.length === 1) {
    return {
      intent: "install",
      operation: "install",
      target: extension,
      resource: extension,
      extension: null,
      raw,
      normalized
    };
  }

  if (!validateOperation("install", resource)) {
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

// ---------------------------------------------------------------------
// COMMAND PARSER
// ---------------------------------------------------------------------

export function parseCommand(text) {
  if (typeof text !== "string") {
    return null;
  }

  const normalized = normalize(text);
  const tokens = tokenize(normalized);

  if (!tokens.length) {
    return null;
  }

  const intent = tokens[0];

  if (!INTENTS.has(intent)) {
    return null;
  }

  if (intent === "install") {
    return parseInstall(tokens, text, normalized);
  }

  if (tokens.length < 2) {
    return null;
  }

  const operation = tokens[1];

  if (!validateOperation(intent, operation)) {
    return null;
  }

  const target = tokens.length > 2
    ? tokens.slice(2).join("-")
    : null;

  return {
    intent,
    operation,
    target,
    resource: null,
    extension: null,
    raw: text,
    normalized
  };
}

// ---------------------------------------------------------------------
// PERMISSION POLICY
// ---------------------------------------------------------------------

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

  if (parsed.intent === "update") {
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

// ---------------------------------------------------------------------
// EXECUTION POLICY
// ---------------------------------------------------------------------

function resolveExecution(parsed) {
  const execution = { ...DEFAULT_EXECUTION };

  if (parsed.intent === "install") {
    execution.timeout_seconds = 1800;
    execution.max_attempts = 2;
    execution.priority = "high";
  }

  if (parsed.intent === "update") {
    execution.timeout_seconds = 1800;
    execution.max_attempts = 2;
    execution.priority = "high";
  }

  if (parsed.intent === "run") {
    execution.timeout_seconds = 900;
  }

  return execution;
}

// ---------------------------------------------------------------------
// NEXUS COMMAND ENVELOPE
// ---------------------------------------------------------------------

export function buildNexusCommand(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const {
    intent,
    operation,
    target,
    raw,
    normalized
  } = parsed;

  if (!INTENTS.has(intent)) {
    return null;
  }

  if (!operation) {
    return null;
  }

  if (intent !== "install" && !validateOperation(intent, operation)) {
    return null;
  }

  if (intent === "install" && operation !== "install") {
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

    intent,
    operation,
    target: target || null,

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
      raw: raw || null,
      normalized: normalized || null,

      arguments: {
        operation,
        target: target || null,
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
        message: "Command accepted into orchestration queue.",
        timestamp: now
      }
    ]
  };
}
