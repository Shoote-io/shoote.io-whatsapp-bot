// services/supabase.js (PART 1 FIXED)

import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

export const supabaseAdmin =
  config.supabaseUrl && config.supabaseServiceRoleKey
    ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : null;

export function assertSupabase() {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.");
  }
}

export function initSupabase() {
  assertSupabase();
  console.log("[SUPABASE] service-role client ready");
}

export async function saveMessage(message) {
  assertSupabase();
  const payload = {
    from_number: message.from_number,
    body: message.body ?? null,
    media_url: message.media_url ?? null,
    media_mime: message.media_mime ?? null,
    raw: typeof message.raw === "string" ? message.raw : JSON.stringify(message.raw || {}),
    role: message.role || "user",
    dedup_key: message.dedup_key || `${message.from_number}:${message.message_id || crypto.randomUUID()}`
  };
  const { data, error } = await supabaseAdmin.from("messages").insert([payload]).select().maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveReply(reply) {
  assertSupabase();
  const payload = {
    to_number: reply.to_number,
    body: reply.body,
    media_url: reply.media_url ?? null,
    role: reply.role || "assistant"
  };
  const { data, error } = await supabaseAdmin.from("replies").insert([payload]).select().maybeSingle();
  if (error) throw error;
  return data;
}

const json = (value, fallback = {}) => {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

export async function createCommand(command) {
  assertSupabase();
  if (!command?.machine_id) throw new Error("machine_id is required.");
  if (!command?.intent) throw new Error("intent is required.");

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
    execution: json(command.execution),
    orchestration: json(command.orchestration),
    permissions: json(command.permissions),
    payload: json(command.payload),
    result: json(command.result),
    state: json(command.state),
    telemetry: json(command.telemetry),
    notes: json(command.notes, []),
    reply_context: json(command.reply_context),
    error_message: null,
    failure_reason: null,
    created_at: command.created_at || now,
    updated_at: command.updated_at || now,
    started_at: null,
    completed_at: null
  };
  const { data, error } = await supabaseAdmin.from("commands").insert([payload]).select().single();
  if (error) throw error;
  return data;
}

export async function getConversation(userNumber, limit = config.conversationLimit) {
  assertSupabase();
  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("from_number, body, created_at, role")
    .eq("from_number", userNumber)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[DB] conversation:", error.message);
    return [];
  }
  return (data || []).reverse();
}

export async function findClientByPhone(phone) {
  assertSupabase();
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("*")
    .eq("phone_number", phone)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
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
  if (error) throw error;
  return data || null;
}

export async function getMachineInfo(machineId) {
  assertSupabase();
  const { data, error } = await supabaseAdmin
    .from("machines")
    .select("hostname,computer_name,status,integrity,trust_level,public_ip,local_ip,runtime_version,bootstrap_version,telemetry,execution_failures,last_heartbeat,machine_id")
    .eq("machine_id", machineId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function uploadMediaToStorage(path, buffer, contentType) {
  assertSupabase();
  const { error } = await supabaseAdmin.storage.from(config.mediaBucket).upload(path, buffer, {
    contentType,
    upsert: false
  });
  if (error) throw error;
  return supabaseAdmin.storage.from(config.mediaBucket).getPublicUrl(path)?.data?.publicUrl || null;
}

export async function saveMediaLog(entry) {
  assertSupabase();
  const { data, error } = await supabaseAdmin.from("media_logs").insert([{
    user_number: entry.user_number,
    file_path: entry.file_path,
    mime_type: entry.mime_type,
    public_url: entry.public_url
  }]);
  if (error) throw error;
  return data;
}

export async function getPendingDeliveryEvents(limit = config.deliveryBatchSize) {
  assertSupabase();
  const select = `id, message_id, machine_id, message_text, delivery_channel, status, sent, created_at, updated_at, sent_at`;

  const { data: ready, error: readyError } = await supabaseAdmin
    .from("runtime_events")
    .select(select)
    .eq("delivery_channel", "whatsapp")
    .eq("sent", false)
    .in("status", ["PENDING_DELIVERY", "ACCEPTED"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (readyError) throw readyError;

  const staleBefore = new Date(Date.now() - config.deliveryStaleAfterMs).toISOString();
  const remaining = Math.max(0, limit - (ready || []).length);

  if (!remaining) return ready || [];

  const { data: stale, error: staleError } = await supabaseAdmin
    .from("runtime_events")
    .select(select)
    .eq("delivery_channel", "whatsapp")
    .eq("sent", false)
    .eq("status", "DELIVERY_IN_PROGRESS")
    .lt("updated_at", staleBefore)
    .order("updated_at", { ascending: true })
    .limit(remaining);

  if (staleError) throw staleError;
  return [...(ready || []), ...(stale || [])];
}

export async function claimDeliveryEvent(eventId) {
  assertSupabase();
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - config.deliveryStaleAfterMs).toISOString();

  // First attempt normal pending/accepted ownership.
  const { data: normal, error: normalError } = await supabaseAdmin
    .from("runtime_events")
    .update({ status: "DELIVERY_IN_PROGRESS", updated_at: now })
    .eq("id", eventId)
    .eq("sent", false)
    .in("status", ["PENDING_DELIVERY", "ACCEPTED"])
    .select("id")
    .maybeSingle();

  if (normalError) throw normalError;
  if (normal?.id) return true;

  // Recover only a genuinely stale in-progress claim.
  const { data: stale, error: staleError } = await supabaseAdmin
    .from("runtime_events")
    .update({ status: "DELIVERY_IN_PROGRESS", updated_at: now })
    .eq("id", eventId)
    .eq("sent", false)
    .eq("status", "DELIVERY_IN_PROGRESS")
    .lt("updated_at", staleBefore)
    .select("id")
    .maybeSingle();

  if (staleError) throw staleError;
  return Boolean(stale?.id);
}

export async function markDeliverySent(eventId, whatsappMessageId) {
  assertSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("runtime_events")
    .update({
      status: "ACCEPTED",
      sent: true,
      sent_at: now,
      updated_at: now,
      delivery_metadata: { whatsapp_message_id: whatsappMessageId, delivered_by: "kaya-nexus-operator", delivered_at: now }
    })
    .eq("id", eventId)
    .eq("sent", false)
    .select("id,sent,sent_at")
    .maybeSingle();

  if (error) {
    // Older schemas may not have delivery_metadata. Retry without that optional field.
    if (/delivery_metadata/i.test(error.message || "")) {
      const retry = await supabaseAdmin
        .from("runtime_events")
        .update({ status: "ACCEPTED", sent: true, sent_at: now, updated_at: now })
        .eq("id", eventId)
        .eq("sent", false)
        .select("id,sent,sent_at")
        .maybeSingle();
      if (retry.error) throw retry.error;
      return Boolean(retry.data?.id && retry.data.sent === true);
    }
    throw error;
  }
  return Boolean(data?.id && data.sent === true);
}

export async function releaseDeliveryEvent(eventId) {
  assertSupabase();
  const { error } = await supabaseAdmin
    .from("runtime_events")
    .update({ status: "PENDING_DELIVERY", updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("sent", false)
    .eq("status", "DELIVERY_IN_PROGRESS");
  if (error) throw error;
}

export async function markDeliveryFailure(eventId, reason) {
  assertSupabase();
  const { error } = await supabaseAdmin
    .from("runtime_events")
    .update({
      status: "DELIVERY_FAILED",
      sent: false,
      updated_at: new Date().toISOString(),
      error_message: String(reason || "DELIVERY_FAILED")
    })
    .eq("id", eventId)
    .eq("sent", false);
  if (error) throw error;
}

