// -----------------------------------------------
//  WhatsApp AI Bot - Restored & Structured Version
//  (Supabase Logging + Robust Error Handling)
// -----------------------------------------------

import crypto from "node:crypto";
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { generateAIReply } from "./services/ai.js";
import {
  initSupabase,
  saveMessage,
  saveReply,
  processMediaUpload,
  createCommand,
  supabaseAdmin // ADD
} from "./services/supabase.js";

const app = express();
app.use(bodyParser.json());

// --------------------------
//  Environment Variables
// --------------------------
const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// --------------------------
//  Logs
// --------------------------
const log = (...x) => console.log("🟦", ...x);
const logError = (...x) => console.error("⛔", ...x);

// ADD (dedup protection)
const processedMessages = new Set();

// --------------------------
//  Init Supabase
// --------------------------
initSupabase();

// -------------------------------------------------
//  SAFE DB HELPERS
// -------------------------------------------------
// REPLACE
async function safeSaveMessage(payload) {
  try {
    const result = await saveMessage({
      from_number: payload.from_number,
      body: payload.body ?? null,
      media_url: payload.media_url ?? null,
      media_mime: payload.media_mime ?? null,
      raw: payload.raw || {}, // ✅ FIX (remove risky JSON hack)
      role: "user"
    });

    if (!result) {
      logError("❌ saveMessage returned NULL");
    } else {
      console.log("✅ Message saved");
    }

  } catch (err) {
    logError("DB saveMessage failed:", err?.message);
  }
}

// REPLACE
async function safeSaveReply(payload) {
  try {
    const result = await saveReply({
      to_number: payload.to_number,
      body: payload.body,
      media_url: payload.media_url ?? null,
      role: "assistant"
    });

    if (!result) {
      logError("❌ saveReply returned NULL");
    } else {
      console.log("✅ Reply saved");
    }

  } catch (err) {
    logError("DB saveReply failed:", err?.message);
  }
}

// -----------------------------
//  Send WhatsApp Message
// -----------------------------

async function sendWhatsAppMessage(to, message) {
  if (!to) {
    return {
      success: false,
      error: "RECIPIENT_MISSING"
    };
  }

  if (!message || !String(message).trim()) {
    return {
      success: false,
      error: "EMPTY_MESSAGE"
    };
  }

  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    return {
      success: false,
      error: "WHATSAPP_CONFIGURATION_MISSING"
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: {
            body: String(message)
          }
        })
      }
    );

    const raw = await response.text();

    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!response.ok) {
      console.error(
        "WhatsApp API rejected message:",
        response.status,
        data
      );

      return {
        success: false,
        error:
          data?.error?.message ||
          `WHATSAPP_API_REJECTED_${response.status}`,
        code:
          data?.error?.code ||
          response.status
      };
    }

    const whatsappMessageId = data?.messages?.[0]?.id;

    if (!whatsappMessageId) {
      console.error(
        "WhatsApp API returned success without a message ID:",
        data
      );

      return {
        success: false,
        error: "WHATSAPP_MESSAGE_ID_MISSING",
        code: response.status
      };
    }

    // The message is considered sent only after Meta accepted it and
    // returned a WhatsApp message ID.
    await safeSaveReply({
      to_number: to,
      body: String(message),
      media_url: null
    });

    log(
      "📤 WhatsApp accepted:",
      to,
      "message_id=",
      whatsappMessageId
    );

    return {
      success: true,
      message_id: whatsappMessageId,
      status: "ACCEPTED",
      http_status: response.status
    };

  } catch (err) {
    logError(
      "WhatsApp Send Error:",
      err?.message || err
    );

    return {
      success: false,
      error: err?.message || "WHATSAPP_SEND_ERROR"
    };
  }
}

async function getMachineIdByPhone(phone) {
  try {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("machine_id")
      .eq("phone_number", phone)
      .maybeSingle();

    if (error) {
      console.error("Machine lookup error:", error.message);
      return null;
    }

    return data?.machine_id || null;
  } catch (err) {
    console.error("Machine lookup failed:", err.message);
    return null;
  }
}

// =====================================================
// NEXUS COMMAND INTENTS
// =====================================================

const NEXUS_INTENTS = [

  "machine",
  "run",
  "install",
  "start"

];

// =====================================================
// NORMALIZE
// =====================================================

function normalize(value) {

  return String(value || "")
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
// UNIVERSAL PARSER
// =====================================================

function parseCommand(text) {

  const cleaned =
    normalize(text);

  const tokens =
    tokenize(cleaned);

  if (tokens.length === 0) {
    return null;
  }

  // ---------------------------------------------------
  // INTENT
  // ---------------------------------------------------

  const intent =
    tokens[0];

  // ---------------------------------------------------
  // VALIDATE INTENT
  // ---------------------------------------------------
  if (intent === "install") {

  if (tokens.length < 4) {
    return null;
  }

  const extension =
    tokens[tokens.length - 1];

  const resource =
    tokens
      .slice(1, -1)
      .join(".");

  return {

    intent,

    operation: "install",

    target: resource,

    resource,

    extension,

    raw: text,

    normalized: cleaned
  };
}
  
  if (
    !NEXUS_INTENTS.includes(intent)
  ) {

    return null;
  }

  // ---------------------------------------------------
  // OPERATION
  // ---------------------------------------------------

  const operation =
    tokens.length >= 2
      ? tokens[1]
      : null;

  // ---------------------------------------------------
  // TARGET
  // ---------------------------------------------------

  const target =
    tokens.length >= 3
      ? tokens
          .slice(2)
          .join("-")
      : null;

  // ---------------------------------------------------
  // COMMAND OBJECT
  // ---------------------------------------------------

  return {

    intent,

    operation,

    target,

    raw: text,

    normalized: cleaned
  };
}

// =====================================================
// BUILD NEXUS COMMAND
// =====================================================

function buildNexusCommand(parsed) {

  if (!parsed) {
    return null;
  }

  if (
    !parsed.operation ||
    parsed.operation.trim() === ""
  ) {

    return null;
  }

  const now =
    new Date().toISOString();

  // ---------------------------------------------------
  // AUTO PERMISSIONS
  // ---------------------------------------------------

  const permissions = {

    filesystem: false,

    network: false,

    shell: false,

    elevated: false
  };

  // install
  if (
    parsed.intent === "install"
  ) {

    permissions.filesystem = true;

    permissions.network = true;
  }

  // run
  if (
    parsed.intent === "run"
  ) {

    permissions.shell = true;
  }

  // start
  if (
    parsed.intent === "start"
  ) {

    permissions.shell = true;
  }

  // ---------------------------------------------------
  // BUILD COMMAND
  // ---------------------------------------------------

  return {

    // =================================================
    // CORE
    // =================================================

    command_id:
      crypto.randomUUID(),

    execution_id:
      null,

    correlation_id:
      crypto.randomUUID(),

    version:
      "1.0.0",

    created_at:
      now,

    updated_at:
      now,

    // =================================================
    // STATUS
    // =================================================

    status:
      "pending",

    // =================================================
    // ROUTING
    // =================================================

    intent:
      parsed.intent,

    operation:
      parsed.operation,

    target:
      parsed.target,

    // =================================================
    // EXECUTION
    // =================================================

    execution: {

      state:
        "queued",

      phase:
        "ingress",

      progress:
        0,

      attempts:
        0,

      max_attempts:
        3,

      priority:
        "normal",

      mode:
        "async",

      timeout_seconds:
        300
    },

    // =================================================
    // ORCHESTRATION
    // =================================================

    orchestration: {

      origin:
        "whatsapp",

      source:
        "nexus-bot",

      transport:
        "supabase",

      runtime:
        "elmidor-nexus",

      dispatch_strategy:
        "intent-contract",

      recovery_strategy:
        "retry"
    },

    // =================================================
    // SECURITY
    // =================================================

    permissions,

    // =================================================
    // PAYLOAD
    // =================================================

payload: {

  raw:
    parsed.raw,

  normalized:
    parsed.normalized,

  arguments: {

    operation:
      parsed.operation,

    target:
      parsed.target,

    resource:
      parsed.resource || null,

    extension:
      parsed.extension || null
  },

      metadata: {

        parser:
          "universal-intent-parser",

        parser_version:
          "1.0.0"
      }
    },

    // =================================================
    // RESULT
    // =================================================

    result: {

      status:
        null,

      code:
        null,

      message:
        null,

      data:
        null,

      artifacts: []
    },

    // =================================================
    // STATE
    // =================================================

    state: {

      current:
        "queued",

      previous:
        null,

      history: [

        {

          state:
            "queued",

          timestamp:
            now
        }
      ]
    },

    // =================================================
    // TELEMETRY
    // =================================================

    telemetry: {

      heartbeat_at:
        null,

      started_at:
        null,

      completed_at:
        null,

      duration_ms:
        null,

      runtime_id:
        null,

      worker_id:
        null,

      machine_id:
        null
    },

    // =================================================
    // NOTES
    // =================================================

    notes: [

      {

        level:
          "info",

        message:
          "Command accepted into orchestration queue.",

        timestamp:
          now
      }
    ]
  };
}

// =====================================================
// BUILD NEXUS COMMAND
// =====================================================

async function getMachineInfo(machineId) {

  try {

    const { data, error } =
      await supabaseAdmin
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
  last_heartbeat
`)
        .eq("machine_id", machineId)
        .maybeSingle();

    if (error) {
      console.error(
        "Machine info error:",
        error.message
      );

      return null;
    }

    return data;

  } catch (err) {

    console.error(
      "Machine info failed:",
      err.message
    );

    return null;

  }

}

// =====================================================
// RUNTIME EVENTS WATCHER
// =====================================================

// =====================================================
// RESPONSE DELIVERY WORKER
// =====================================================
//
// This worker is intentionally independent from the incoming
// WhatsApp webhook.
//
// The response pipeline writes RESPONSE_DELIVERY_CANDIDATE rows
// into runtime_events. This worker continuously discovers rows
// that still need delivery, claims them, sends them to WhatsApp,
// and only then marks them as sent.
//
// IMPORTANT:
// - Incoming WhatsApp traffic does NOT wake this worker.
// - Listener activity does NOT need to trigger this worker.
// - `sent=true` is written only after Meta accepts the message.
// - Existing ACCEPTED + sent=false rows are also considered
//   deliverable because older generator versions produced that
//   state.
//
// =====================================================

const RESPONSE_DELIVERY_POLL_MS = 5000;
const RESPONSE_DELIVERY_BATCH_SIZE = 10;

let responseDeliveryWorkerRunning = false;
let responseDeliveryWorkerTimer = null;

async function claimRuntimeEvent(eventId) {
  try {
    const { data, error } = await supabaseAdmin
      .from("runtime_events")
      .update({
        status: "DELIVERY_IN_PROGRESS",
        updated_at: new Date().toISOString()
      })
      .eq("id", eventId)
      .eq("sent", false)
      .in("status", [
        "PENDING_DELIVERY",
        "ACCEPTED"
      ])
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(
        "Runtime event claim failed:",
        eventId,
        error.message
      );

      return false;
    }

    return Boolean(data?.id);

  } catch (err) {
    console.error(
      "Runtime event claim exception:",
      eventId,
      err?.message || err
    );

    return false;
  }
}

async function markRuntimeEventDelivered(
  eventId,
  whatsappMessageId
) {
  try {
    const currentTime =
      new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("runtime_events")
      .update({
        status: "ACCEPTED",
        sent: true,
        sent_at: currentTime,
        updated_at: currentTime
      })
      .eq("id", eventId)
      .eq("sent", false)
      .select("id, sent, sent_at")
      .maybeSingle();

    if (error) {
      console.error(
        "Runtime event delivery state update failed:",
        eventId,
        error.message
      );

      return false;
    }

    if (!data?.id || data.sent !== true) {
      console.error(
        "Runtime event delivery state was not confirmed:",
        eventId
      );

      return false;
    }

    log(
      "✅ Runtime event marked SENT:",
      eventId,
      "whatsapp_message_id=",
      whatsappMessageId
    );

    return true;

  } catch (err) {
    console.error(
      "Runtime event delivery state exception:",
      eventId,
      err?.message || err
    );

    return false;
  }
}

async function releaseRuntimeEventClaim(eventId) {
  try {
    const { error } = await supabaseAdmin
      .from("runtime_events")
      .update({
        status: "PENDING_DELIVERY",
        updated_at: new Date().toISOString()
      })
      .eq("id", eventId)
      .eq("sent", false)
      .eq("status", "DELIVERY_IN_PROGRESS");

    if (error) {
      console.error(
        "Runtime event claim release failed:",
        eventId,
        error.message
      );

      return false;
    }

    return true;

  } catch (err) {
    console.error(
      "Runtime event claim release exception:",
      eventId,
      err?.message || err
    );

    return false;
  }
}

async function fetchPendingRuntimeEvents() {
  const { data: events, error } =
    await supabaseAdmin
      .from("runtime_events")
      .select(`
        id,
        message_id,
        machine_id,
        message_text,
        delivery_channel,
        status,
        sent,
        created_at,
        updated_at,
        clients!inner (
          phone_number
        )
      `)
      .eq("delivery_channel", "whatsapp")
      .eq("sent", false)
      .in("status", [
        "PENDING_DELIVERY",
        "ACCEPTED"
      ])
      .order("created_at", { ascending: true })
      .limit(RESPONSE_DELIVERY_BATCH_SIZE);

  if (error) {
    throw error;
  }

  return events || [];
}

async function processRuntimeEventDelivery(event) {
  const eventId = event?.id;
  const messageId = event?.message_id;

  if (!eventId) {
    console.error(
      "Runtime event skipped: missing database id."
    );
    return;
  }

  const phone =
    event?.clients?.phone_number || null;

  const message =
    event?.message_text || null;

  if (!phone || !message) {
    console.error(
      "Runtime event invalid for delivery:",
      {
        id: eventId,
        message_id: messageId,
        has_phone: Boolean(phone),
        has_message: Boolean(message)
      }
    );

    return;
  }

  // Atomic claim. If another worker instance already claimed
  // this row, no message is sent by this instance.
  const claimed =
    await claimRuntimeEvent(eventId);

  if (!claimed) {
    log(
      "↪️ Runtime event already claimed or no longer pending:",
      messageId || eventId
    );

    return;
  }

  try {
    log(
      "📨 Delivering runtime event:",
      messageId || eventId
    );

    const delivery =
      await sendWhatsAppMessage(
        phone,
        message
      );

    if (!delivery?.success) {
      console.error(
        "Runtime event WhatsApp delivery failed:",
        messageId || eventId,
        delivery?.error
      );

      await releaseRuntimeEventClaim(eventId);
      return;
    }

    const stateSaved =
      await markRuntimeEventDelivered(
        eventId,
        delivery.message_id
      );

    if (!stateSaved) {
      console.error(
        "⚠️ WhatsApp accepted the message, but the runtime event could not be confirmed as SENT:",
        messageId || eventId
      );

      // Do NOT blindly resend here. Meta already accepted the
      // message. The row remains sent=false so it can be audited
      // and reconciled instead of creating an automatic duplicate.
      return;
    }

    log(
      "📤 Runtime event delivered successfully:",
      messageId || eventId
    );

  } catch (err) {
    console.error(
      "Runtime event delivery exception:",
      messageId || eventId,
      err?.message || err
    );

    await releaseRuntimeEventClaim(eventId);
  }
}

async function runResponseDeliveryCycle() {
  if (responseDeliveryWorkerRunning) {
    return;
  }

  responseDeliveryWorkerRunning = true;

  try {
    const events =
      await fetchPendingRuntimeEvents();

    if (!events.length) {
      return;
    }

    log(
      "🔎 Response delivery cycle:",
      events.length,
      "candidate(s)"
    );

    for (const event of events) {
      await processRuntimeEventDelivery(event);
    }

  } catch (err) {
    console.error(
      "Response delivery worker cycle failed:",
      err?.message || err
    );

  } finally {
    responseDeliveryWorkerRunning = false;
  }
}

function scheduleResponseDeliveryWorker() {
  if (responseDeliveryWorkerTimer) {
    return;
  }

  const scheduleNext = async () => {
    await runResponseDeliveryCycle();

    responseDeliveryWorkerTimer =
      setTimeout(
        scheduleNext,
        RESPONSE_DELIVERY_POLL_MS
      );
  };

  // Run immediately at startup. Do not wait for an incoming
  // WhatsApp message to activate delivery.
  scheduleNext().catch(err => {
    console.error(
      "Response delivery worker startup failed:",
      err?.message || err
    );

    responseDeliveryWorkerTimer =
      setTimeout(
        scheduleNext,
        RESPONSE_DELIVERY_POLL_MS
      );
  });
}


// -------------------------------------------------
//  VERIFY WEBHOOK
// -------------------------------------------------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// -------------------------------------------------
//  HANDLE INCOMING WHATSAPP MESSAGES (PART 2 FIXED)
// -------------------------------------------------
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (body.object !== "whatsapp_business_account") {
      return res.sendStatus(404);
    }

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    const from = message?.from;

    if (!message) return res.sendStatus(200);

    // ADD (dedup protection)
    const messageId = message.id;
    if (processedMessages.has(messageId)) {
      log("⚠️ Duplicate skipped:", messageId);
      return res.sendStatus(200);
    }
    processedMessages.add(messageId);

    log("📩 Incoming:", message.type, "from:", from);

// -------------------------
// 1. HANDLE TEXT MESSAGE
// -------------------------
if (message.type === "text") {

  const text = (message.text.body || "").trim();
  const lower = text.toLowerCase();

  await safeSaveMessage({
    from_number: from,
    body: text,
    media_url: null,
    media_mime: null,
    raw: message
  });

// =====================================================
// EXECUTE NEXUS COMMAND
// =====================================================

const parsed =
  parseCommand(lower);

const nexusCommand =
  buildNexusCommand(parsed);

// -----------------------------------------------------
// VALID NEXUS COMMAND
// -----------------------------------------------------

if (nexusCommand) {

  log(
    "⚡ NEXUS COMMAND:",
    nexusCommand
  );

  try {

    // -------------------------------------------------
    // MACHINE LINK
    // -------------------------------------------------

    const machineId =
      await getMachineIdByPhone(from);

    if (!machineId) {

      await sendWhatsAppMessage(

        from,

        "❌ Machine not linked."
      );

      return res.sendStatus(200);
    }

    // -------------------------------------------------
    // INSERT COMMAND
    // -------------------------------------------------

    await createCommand({

      command_id:
        nexusCommand.command_id,

      execution_id:
        nexusCommand.execution_id,

      correlation_id:
        nexusCommand.correlation_id,

      machine_id:
        machineId,

      runtime_id:
        null,

      runtime_session_id:
        null,

      version:
        nexusCommand.version,

      organization:
        null,

      process_id:
        null,

      status:
        nexusCommand.status,

      intent:
        nexusCommand.intent,

      operation:
        nexusCommand.operation,

      target:
        nexusCommand.target,

      worker:
        null,

      engine:
        null,

      notified:
        false,

      reply_context: {
        phone_number: from
      },
      
      execution:
        nexusCommand.execution,

      orchestration:
        nexusCommand.orchestration,

      permissions:
        nexusCommand.permissions,

      payload:
        nexusCommand.payload,

      result:
        nexusCommand.result,

      state:
        nexusCommand.state,

      telemetry:
        nexusCommand.telemetry,

      notes:
        nexusCommand.notes,

      error_message:
        null,

      failure_reason:
        null,

      created_at:
        nexusCommand.created_at,

      updated_at:
        nexusCommand.updated_at,

      started_at:
        null,

      completed_at:
        null
    });

    // -------------------------------------------------
    // MACHINE STATUS
    // -------------------------------------------------

    if (

      nexusCommand.intent === "machine" &&

      nexusCommand.operation === "status"

    ) {

      const machineInfo =
        await getMachineInfo(machineId);

      if (machineInfo) {

        const telemetry =

          typeof machineInfo.telemetry === "string"

            ? JSON.parse(
                machineInfo.telemetry
              )

            : machineInfo.telemetry || {};

        const cpu =
          telemetry?.hardware?.CPU?.NAME ||
          "Unknown CPU";

        const cores =
          telemetry?.hardware?.CPU?.CORES ||
          "?";

        const threads =
          telemetry?.hardware?.CPU?.THREADS ||
          "?";

        const ram =
          telemetry?.hardware?.MEMORY?.TOTAL_GB ||
          "?";

        const totalStorage =
          telemetry?.storage?.total_gb ||
          "?";

        const usedStorage =
          telemetry?.storage?.used_gb ||
          "?";

        const freeStorage =
          telemetry?.storage?.free_gb ||
          "?";

        await sendWhatsAppMessage(

          from,

          [

            "🖥️ *Elmidor Nexus • Machine Status*",
            "",

            `🧠 Hostname: *${machineInfo.hostname || "UNKNOWN"}*`,

            `📍 Machine: *${machineInfo.computer_name || "UNKNOWN"}*`,

            `🟢 Status: *${(machineInfo.status || "offline").toUpperCase()}*`,

            `🛡️ Integrity: *${(machineInfo.integrity || "unknown").toUpperCase()}*`,

            `🔐 Trust Level: *${(machineInfo.trust_level || "unknown").toUpperCase()}*`,

            "",

            `🌐 Public IP: ${machineInfo.public_ip || "N/A"}`,

            `🏠 Local IP: ${machineInfo.local_ip || "N/A"}`,

            "",

            `⚙️ Runtime Version: ${machineInfo.runtime_version || "N/A"}`,

            `🚀 Bootstrap: ${machineInfo.bootstrap_version || "N/A"}`,

            "",

            `💻 CPU: ${cpu}`,

            `🧩 Cores: ${cores} / Threads: ${threads}`,

            "",

            "💾 Storage:",

            `• Total: ${totalStorage} GB`,

            `• Used: ${usedStorage} GB`,

            `• Free: ${freeStorage} GB`,

            "",

            `🧠 RAM: ${ram} GB`,

            `❌ Execution Failures: ${machineInfo.execution_failures || 0}`,

            "",

            "🕒 Last Heartbeat:",

            `${machineInfo.last_heartbeat || "Unknown"}`,

            "",

            "━━━━━━━━━━━━━━━",

            "🧠 Nexus Runtime Ecosystem",

            "━━━━━━━━━━━━━━━",

            "",

            "Machine successfully linked",

            "to the distributed runtime",

            "ecosystem.",

            "",

            "Waiting for live telemetry",

            "from orchestration workers..."

          ].join("\n")
        );
      }
    }

    // -------------------------------------------------
    // DEFAULT QUEUE RESPONSE
    // -------------------------------------------------

    else {

      await sendWhatsAppMessage(

        from,

        [

          "✅ Command queued",
          "",

          `🧠 Intent: ${nexusCommand.intent}`,

          `⚙️ Operation: ${nexusCommand.operation}`,

          `🎯 Target: ${nexusCommand.target || "none"}`,

          "",

          "📦 Status: queued"

        ].join("\n")
      );
    }

  } catch (err) {

    logError(
      "Nexus command error:",
      err.message
    );

    await sendWhatsAppMessage(

      from,

      "⚠️ Failed to queue Nexus command."
    );
  }

  return res.sendStatus(200);
}
  
      if (
        ["hi", "hello", "salut", "bonjour", "hola", "alo"].some(x =>
          lower.includes(x)
        )
      ) {
        await sendWhatsAppMessage(
          from,
          "Bonjou! Kijan mwen ka ede w jodi a?"
        );
        return res.sendStatus(200);
      }

      if (
        lower.includes("pri") ||
        lower.includes("price") ||
        lower.includes("prix")
      ) {
        await sendWhatsAppMessage(
          from,
          "Pou enpresyon, pri yo depann de kalite travay la. Ki tip enpresyon ou bezwen? (kat biznis, bannè, logo, elatriye)."
        );
        return res.sendStatus(200);
      }

      const aiReply = await generateAIReply(text);

      if (aiReply) {
        await sendWhatsAppMessage(from, aiReply);
      }

      return res.sendStatus(200);
    }
    
// -------------------------
// 2. HANDLE IMAGE MESSAGE
// -------------------------
if (message.type === "image") {
  try {
    const mediaId = message.image.id;

    if (!mediaId) {
      logError("Missing mediaId");
      return res.sendStatus(200);
    }

    // Step 1 – Fetch media metadata
    const mediaResp = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
      }
    );

    const meta = await mediaResp.json();

    const mediaUrl = meta?.url;
    const mimeType = meta?.mime_type || "image/jpeg";

    if (!mediaUrl) {
      throw new Error("No media URL returned");
    }

    // Step 2 – Download file binary
    const rawFile = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });

    const buffer = Buffer.from(await rawFile.arrayBuffer());

    // Step 3 – Upload + Get Public URL
    const filename = `${Date.now()}.jpg`;

    const mediaRecord = await processMediaUpload(
      from,
      filename,
      buffer,
      mimeType
    );

    const publicUrl = mediaRecord?.public_url || null;

    // Step 4 – Save incoming message log
    await safeSaveMessage({
      from_number: from,
      body: null,
      media_url: publicUrl,
      media_mime: mimeType,
      raw: message
    });

    // Step 5 – Reply
    await sendWhatsAppMessage(
      from,
      `🌟 Mèsi pou enterè w nan *Elmidor Group Influence & Entrepreneurship Challenge* la!

Nou konfime resevwa screenshot ou a.  

📌 *ETAP SUIVAN:*  
Tanpri ranpli fòm ofisyèl enskripsyon an pou valide patisipasyon ou:

👉 https://tally.so/r/Zj9A1z

Apre ou fin ranpli li, n ap voye règleman yo + etap final yo.  
Bòn chans ak avni ou! 🚀✨`
    );

  } catch (err) {
    logError("Image handling error:", err?.message);

    await sendWhatsAppMessage(
      from,
      "Nou resevwa mesaj ou! Si gen pwoblèm ak fichye a, nou ap verifye li. ✔"
    );
  }

  return res.sendStatus(200);
}

// -------------------------
// 3. HANDLE OTHER TYPES
// -------------------------
await safeSaveMessage({
  from_number: from,
  body: null,
  media_url: null,
  media_mime: message.type,
  raw: message
});

await sendWhatsAppMessage(
  from,
  `Mwen resevwa yon mesaj tip *${message.type}*.`
);

return res.sendStatus(200);

} catch (err) {
  logError("🔥 Fatal webhook error:", err?.message);
  return res.sendStatus(200);
}
});

// --------------------------
//  Start Server
// --------------------------

const server = app.listen(PORT, () => {
  log(`🚀 Server running on port ${PORT}`);
  log(
    `📨 Response delivery worker online. Poll=${RESPONSE_DELIVERY_POLL_MS}ms`
  );

  scheduleResponseDeliveryWorker();
});

// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

function shutdown(signal) {
  log(`🛑 ${signal} received. Shutting down...`);

  if (responseDeliveryWorkerTimer) {
    clearTimeout(responseDeliveryWorkerTimer);
    responseDeliveryWorkerTimer = null;
  }

  server.close(() => {
    log("🛑 Server closed.");
    process.exit(0);
  });

  setTimeout(() => {
    logError("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
