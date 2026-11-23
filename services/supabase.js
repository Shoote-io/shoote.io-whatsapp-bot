
// --------------------------------------------------
// KAYA NEXUS OPERATOR
// SUPABASE SERVICE
// --------------------------------------------------

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

// --------------------------------------------------
// 1. CLIENT INITIALIZATION
// --------------------------------------------------

export const supabaseAdmin =
  config.supabaseUrl && config.supabaseServiceRoleKey
    ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      })
    : null;

export function assertSupabase() {
  if (!supabaseAdmin) {
    throw new Error(
      "SUPABASE_CONFIGURATION_MISSING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    );
  }
}

export function initSupabase() {
  assertSupabase();
  console.log("[SUPABASE] service-role client ready");
}

// --------------------------------------------------
// 2. SHARED HELPERS
// --------------------------------------------------

function parseJson(value, fallback = {}) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeLimit(value, fallback, maximum = 100) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(1, Math.min(maximum, Math.floor(parsed)));
}

function phoneCandidates(phone) {
  const raw = String(phone || "").trim();

  if (!raw) {
    throw new Error("PHONE_NUMBER_REQUIRED");
  }

  const digits = raw.replace(/\D/g, "");

  return [...new Set([
    raw,
    digits,
    digits ? `+${digits}` : null
  ].filter(Boolean))];
}

function throwDatabaseError(operation, error) {
  if (!error) return;

  console.error(`[SUPABASE][${operation}]`, {
    message: error.message,
    code: error.code || null,
    details: error.details || null
  });

  throw error;
}

// --------------------------------------------------
// 3. MESSAGE STORAGE
// --------------------------------------------------

export async function saveMessage(message) {
  assertSupabase();

  if (!message?.from_number) {
    throw new Error("MESSAGE_FROM_NUMBER_REQUIRED");
  }

  const payload = {
    from_number: message.from_number,
    body: message.body ?? null,
    media_url: message.media_url ?? null,
    media_mime: message.media_mime ?? null,

    raw:
      typeof message.raw === "string"
        ? message.raw
        : JSON.stringify(message.raw || {}),

    role: message.role || "user",

    dedup_key:
      message.dedup_key ||
      `${message.from_number}:${message.message_id || crypto.randomUUID()}`
  };

  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert([payload])
    .select()
    .maybeSingle();

  throwDatabaseError("SAVE_MESSAGE", error);

  return data;
}

export async function saveReply(reply) {
  assertSupabase();

  if (!reply?.to_number) {
    throw new Error("REPLY_TO_NUMBER_REQUIRED");
  }

  if (!reply?.body) {
    throw new Error("REPLY_BODY_REQUIRED");
  }

  const payload = {
    to_number: reply.to_number,
    body: reply.body,
    media_url: reply.media_url ?? null,
    role: reply.role || "assistant"
  };

  const { data, error } = await supabaseAdmin
    .from("replies")
    .insert([payload])
    .select()
    .maybeSingle();

  throwDatabaseError("SAVE_REPLY", error);

  return data;
}

// --------------------------------------------------
// 4. CONVERSATION HISTORY
// --------------------------------------------------

export async function getConversation(
  userNumber,
  limit = config.conversationLimit
) {
  assertSupabase();

  const numbers = phoneCandidates(userNumber);
  const safeLimit = normalizeLimit(limit, 10, 30);

  const [messagesResult, repliesResult] = await Promise.all([
    supabaseAdmin
      .from("messages")
      .select("from_number, body, created_at, role")
      .in("from_number", numbers)
      .order("created_at", { ascending: false })
      .limit(safeLimit),

    supabaseAdmin
      .from("replies")
      .select("to_number, body, created_at, role")
      .in("to_number", numbers)
      .order("created_at", { ascending: false })
      .limit(safeLimit)
  ]);

  throwDatabaseError("GET_CONVERSATION_MESSAGES", messagesResult.error);
  throwDatabaseError("GET_CONVERSATION_REPLIES", repliesResult.error);

  const messages = (messagesResult.data || []).map(item => ({
    body: item.body,
    role: item.role === "assistant" ? "assistant" : "user",
    created_at: item.created_at
  }));

  const replies = (repliesResult.data || []).map(item => ({
    body: item.body,
    role: item.role === "assistant" ? "assistant" : "assistant",
    created_at: item.created_at
  }));

  return [...messages, ...replies]
    .filter(item => item.body)
    .sort((a, b) => {
      return new Date(a.created_at).getTime() -
        new Date(b.created_at).getTime();
    })
    .slice(-safeLimit);
}

// --------------------------------------------------
// 5. CLIENT LOOKUP
// --------------------------------------------------

export async function findClientByPhone(phone) {
  assertSupabase();

  const numbers = phoneCandidates(phone);

  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("*")
    .in("phone_number", numbers)
    .limit(1)
    .maybeSingle();

  throwDatabaseError("FIND_CLIENT_BY_PHONE", error);

  return data || null;
}

export async function findClientByMachineId(machineId) {
  assertSupabase();

  if (!machineId) return null;

  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("machine_id", machineId)
    .limit(1)
    .maybeSingle();

  throwDatabaseError("FIND_CLIENT_BY_MACHINE_ID", error);

  return data || null;
}

// --------------------------------------------------
// 6. MACHINE INFORMATION
// --------------------------------------------------

export async function getMachineInfo(machineId) {
  assertSupabase();

  if (!machineId) {
    throw new Error("MACHINE_ID_REQUIRED");
  }

  const { data, error } = await supabaseAdmin
    .from("machines")
    .select(`
      hostname,
      computer_name,
      status,
      integrity,
      trust_level,
      public_ip,
      local_ip,
      runtime_version,
      bootstrap_version,
      telemetry,
      execution_failures,
      last_heartbeat,
      machine_id
    `)
    .eq("machine_id", machineId)
    .maybeSingle();

  throwDatabaseError("GET_MACHINE_INFO", error);

  return data || null;
}

// --------------------------------------------------
// 7. COMMAND STORAGE
// --------------------------------------------------

export async function createCommand(command) {
  assertSupabase();

  if (!command?.machine_id) {
    throw new Error("COMMAND_MACHINE_ID_REQUIRED");
  }

  if (!command?.intent) {
    throw new Error("COMMAND_INTENT_REQUIRED");
  }

  const now = new Date().toISOString();

  const payload = {
    command_id: command.command_id || crypto.randomUUID(),
    execution_id: command.execution_id || null,
    correlation_id: command.correlation_id || crypto.randomUUID(),

    machine_id: command.machine_id,
    runtime_id: command.runtime_id || null,
    runtime_session_id: command.runtime_session_id || null,

    version: command.version || "2.0.0",
    organization: command.organization || null,

    process_id: command.process_id || null,
    status: command.status || "pending",

    intent: command.intent,
    operation: command.operation || null,
    target: command.target || null,
    worker: command.worker || null,
    engine: command.engine || null,

    notified: false,

    execution: parseJson(command.execution),
    orchestration: parseJson(command.orchestration),
    permissions: parseJson(command.permissions),
    payload: parseJson(command.payload),
    result: parseJson(command.result),
    state: parseJson(command.state),
    telemetry: parseJson(command.telemetry),
    notes: parseJson(command.notes, []),
    reply_context: parseJson(command.reply_context),

    error_message: null,
    failure_reason: null,

    created_at: command.created_at || now,
    updated_at: command.updated_at || now,
    started_at: null,
    completed_at: null
  };

  const { data, error } = await supabaseAdmin
    .from("commands")
    .insert([payload])
    .select()
    .single();

  throwDatabaseError("CREATE_COMMAND", error);

  return data;
}

// --------------------------------------------------
// 8. MEDIA STORAGE
// --------------------------------------------------

export async function uploadMediaToStorage(path, buffer, contentType) {
  assertSupabase();

  if (!path || !buffer) {
    throw new Error("MEDIA_PATH_OR_BUFFER_REQUIRED");
  }

  const { error } = await supabaseAdmin.storage
    .from(config.mediaBucket)
    .upload(path, buffer, {
      contentType,
      upsert: false
    });

  throwDatabaseError("UPLOAD_MEDIA", error);

  return (
    supabaseAdmin.storage
      .from(config.mediaBucket)
      .getPublicUrl(path)?.data?.publicUrl || null
  );
}

export async function saveMediaLog(entry) {
  assertSupabase();

  const { data, error } = await supabaseAdmin
    .from("media_logs")
    .insert([{
      user_number: entry.user_number,
      file_path: entry.file_path,
      mime_type: entry.mime_type,
      public_url: entry.public_url
    }]);

  throwDatabaseError("SAVE_MEDIA_LOG", error);

  return data;
}

// --------------------------------------------------
// 9. DELIVERY EVENT DISCOVERY
// --------------------------------------------------

export async function getPendingDeliveryEvents(
  limit = config.deliveryBatchSize
) {
  assertSupabase();

  const safeLimit = normalizeLimit(limit, 25, 100);

  const select = [
    "id",
    "message_id",
    "machine_id",
    "message_text",
    "delivery_channel",
    "status",
    "sent",
    "created_at",
    "updated_at",
    "sent_at"
  ].join(",");

  const { data: ready, error: readyError } = await supabaseAdmin
    .from("runtime_events")
    .select(select)
    .eq("delivery_channel", "whatsapp")
    .eq("sent", false)
    .in("status", ["PENDING_DELIVERY", "ACCEPTED"])
    .order("created_at", { ascending: true })
    .limit(safeLimit);

  throwDatabaseError("DISCOVER_PENDING_DELIVERY", readyError);

  const pending = ready || [];
  const remaining = safeLimit - pending.length;

  if (remaining <= 0) return pending;

  const staleBefore = new Date(
    Date.now() - config.deliveryStaleAfterMs
  ).toISOString();

  const { data: stale, error: staleError } = await supabaseAdmin
    .from("runtime_events")
    .select(select)
    .eq("delivery_channel", "whatsapp")
    .eq("sent", false)
    .eq("status", "DELIVERY_IN_PROGRESS")
    .lt("updated_at", staleBefore)
    .order("updated_at", { ascending: true })
    .limit(remaining);

  throwDatabaseError("DISCOVER_STALE_DELIVERY", staleError);

  return [...pending, ...(stale || [])];
}

// --------------------------------------------------
// 10. DELIVERY EVENT CLAIM
// --------------------------------------------------

export async function claimDeliveryEvent(eventId) {
  assertSupabase();

  if (!eventId) {
    throw new Error("DELIVERY_EVENT_ID_REQUIRED");
  }

  const now = new Date().toISOString();

  const staleBefore = new Date(
    Date.now() - config.deliveryStaleAfterMs
  ).toISOString();

  // Claim a normal pending event.
  const { data: normal, error: normalError } = await supabaseAdmin
    .from("runtime_events")
    .update({
      status: "DELIVERY_IN_PROGRESS",
      updated_at: now
    })
    .eq("id", eventId)
    .eq("sent", false)
    .in("status", ["PENDING_DELIVERY", "ACCEPTED"])
    .select("id")
    .maybeSingle();

  throwDatabaseError("CLAIM_DELIVERY_EVENT", normalError);

  if (normal?.id) return true;

  // Recover only an expired claim.
  const { data: stale, error: staleError } = await supabaseAdmin
    .from("runtime_events")
    .update({
      status: "DELIVERY_IN_PROGRESS",
      updated_at: now
    })
    .eq("id", eventId)
    .eq("sent", false)
    .eq("status", "DELIVERY_IN_PROGRESS")
    .lt("updated_at", staleBefore)
    .select("id")
    .maybeSingle();

  throwDatabaseError("RECOVER_DELIVERY_EVENT", staleError);

  return Boolean(stale?.id);
}

// --------------------------------------------------
// 11. DELIVERY SUCCESS
// --------------------------------------------------

export async function markDeliverySent(eventId, whatsappMessageId) {
  assertSupabase();

  if (!eventId) {
    throw new Error("DELIVERY_EVENT_ID_REQUIRED");
  }

  const now = new Date().toISOString();

  const updatePayload = {
    status: "ACCEPTED",
    sent: true,
    sent_at: now,
    updated_at: now,
    delivery_metadata: {
      whatsapp_message_id: whatsappMessageId,
      delivered_by: "kaya-nexus-operator",
      delivered_at: now
    }
  };

  const query = () => supabaseAdmin
    .from("runtime_events")
    .update(updatePayload)
    .eq("id", eventId)
    .eq("sent", false)
    .eq("status", "DELIVERY_IN_PROGRESS")
    .select("id,sent,sent_at")
    .maybeSingle();

  let { data, error } = await query();

  // Compatibility with schemas without delivery_metadata.
  if (error && /delivery_metadata/i.test(error.message || "")) {
    const retry = await supabaseAdmin
      .from("runtime_events")
      .update({
        status: "ACCEPTED",
        sent: true,
        sent_at: now,
        updated_at: now
      })
      .eq("id", eventId)
      .eq("sent", false)
      .eq("status", "DELIVERY_IN_PROGRESS")
      .select("id,sent,sent_at")
      .maybeSingle();

    data = retry.data;
    error = retry.error;
  }

  throwDatabaseError("MARK_DELIVERY_SENT", error);

  return Boolean(data?.id && data.sent === true);
}

// --------------------------------------------------
// 12. DELIVERY RELEASE
// --------------------------------------------------

export async function releaseDeliveryEvent(eventId) {
  assertSupabase();

  if (!eventId) {
    throw new Error("DELIVERY_EVENT_ID_REQUIRED");
  }

  const { data, error } = await supabaseAdmin
    .from("runtime_events")
    .update({
      status: "PENDING_DELIVERY",
      updated_at: new Date().toISOString()
    })
    .eq("id", eventId)
    .eq("sent", false)
    .eq("status", "DELIVERY_IN_PROGRESS")
    .select("id")
    .maybeSingle();

  throwDatabaseError("RELEASE_DELIVERY_EVENT", error);

  return Boolean(data?.id);
}

// --------------------------------------------------
// 13. DELIVERY FAILURE
// --------------------------------------------------

export async function markDeliveryFailure(eventId, reason) {
  assertSupabase();

  if (!eventId) {
    throw new Error("DELIVERY_EVENT_ID_REQUIRED");
  }

  const { data, error } = await supabaseAdmin
    .from("runtime_events")
    .update({
      status: "DELIVERY_FAILED",
      sent: false,
      updated_at: new Date().toISOString(),
      error_message: String(reason || "DELIVERY_FAILED").slice(0, 2000)
    })
    .eq("id", eventId)
    .eq("sent", false)
    .eq("status", "DELIVERY_IN_PROGRESS")
    .select("id")
    .maybeSingle();

  throwDatabaseError("MARK_DELIVERY_FAILURE", error);

  return Boolean(data?.id);
}
