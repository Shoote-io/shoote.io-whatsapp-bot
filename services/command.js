import crypto from "node:crypto";

const INTENTS = new Set(["machine", "run", "install", "update", "start"]);

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/_/g, "-")
    .replace(/\./g, "-");
}

function tokenize(text) {
  return normalize(text).split(" ").filter(Boolean);
}

export function parseCommand(text) {
  const cleaned = normalize(text);
  const tokens = tokenize(cleaned);
  if (!tokens.length) return null;

  const intent = tokens[0];
  if (!INTENTS.has(intent)) return null;

  if (intent === "install") {
    if (tokens.length < 4) return null;
    const extension = tokens.at(-1);
    const resource = tokens.slice(1, -1).join(".");
    return { intent, operation: "install", target: resource, resource, extension, raw: text, normalized: cleaned };
  }

  return {
    intent,
    operation: tokens[1] || null,
    target: tokens.length > 2 ? tokens.slice(2).join("-") : null,
    raw: text,
    normalized: cleaned
  };
}

export function buildNexusCommand(parsed) {
  if (!parsed?.operation) return null;

  const now = new Date().toISOString();
  const permissions = { filesystem: false, network: false, shell: false, elevated: false };

  if (parsed.intent === "install") {
    permissions.filesystem = true;
    permissions.network = true;
  }
  if (parsed.intent === "run" || parsed.intent === "start") permissions.shell = true;

  return {
    command_id: crypto.randomUUID(),
    execution_id: null,
    correlation_id: crypto.randomUUID(),
    version: "2.0.0",
    created_at: now,
    updated_at: now,
    status: "pending",
    intent: parsed.intent,
    operation: parsed.operation,
    target: parsed.target,
    execution: { state: "queued", phase: "ingress", progress: 0, attempts: 0, max_attempts: 3, priority: "normal", mode: "async", timeout_seconds: 300 },
    orchestration: { origin: "whatsapp", source: "kaya-nexus-operator", transport: "supabase", runtime: "elmidor-nexus", dispatch_strategy: "intent-contract", recovery_strategy: "retry" },
    permissions,
    payload: {
      raw: parsed.raw,
      normalized: parsed.normalized,
      arguments: { operation: parsed.operation, target: parsed.target, resource: parsed.resource || null, extension: parsed.extension || null },
      metadata: { parser: "nexus-operator-command-parser", parser_version: "2.0.0" }
    },
    result: { status: null, code: null, message: null, data: null, artifacts: [] },
    state: { current: "queued", previous: null, history: [{ state: "queued", timestamp: now }] },
    telemetry: { heartbeat_at: null, started_at: null, completed_at: null, duration_ms: null, runtime_id: null, worker_id: null, machine_id: null },
    notes: [{ level: "info", message: "Command accepted into orchestration queue.", timestamp: now }]
  };
}
