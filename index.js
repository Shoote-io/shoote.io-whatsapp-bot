// -----------------------------------------------
//  WhatsApp AI Bot - Restored & Structured Version
//  (Supabase Logging + Robust Error Handling)
// -----------------------------------------------

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
  try {
    if (!message) return; // ADD (prevent empty send)
    // ADD before fetch
console.log("📤 Sending message:", message);

    await fetch(
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
          text: { body: message }
        })
      }
    );

    await safeSaveReply({
      to_number: to,
      body: message,
      media_url: null
    });

    log("📤 Message sent →", to);
  } catch (err) {
    logError("WhatsApp Send Error:", err?.message);
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
          parsed.target
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
// COMMAND RESULT WATCHER
// =====================================================

async function watchCompletedCommands() {

  try {

    const { data: commands, error } =
      await supabaseAdmin
        .from("commands")
        .select("*")
        .eq("status", "completed")
        .eq("notified", false)
        .order("created_at", { ascending: true })
        .limit(10);

    if (error) {

      console.error(
        "Watcher error:",
        error.message
      );

      return;

    }

    if (!commands?.length) return;

    for (const cmd of commands) {

      try {

        // ------------------------------------------
        // FIND PHONE
        // ------------------------------------------

        const { data: client } =
          await supabaseAdmin
            .from("clients")
            .select("phone_number")
            .eq("machine_id", cmd.machine_id)
            .maybeSingle();

        if (!client?.phone_number) {
          continue;
        }

        // ------------------------------------------
        // FORMAT RESULT
        // ------------------------------------------

        const result =
          typeof cmd.result === "string"
            ? JSON.parse(cmd.result)
            : cmd.result;

        let message =
          `✅ *Scan Status Completed*\n` +
          `Machine: ${result.machine}\n` +
          `Worker: ${cmd.worker}\n\n`;

        // ------------------------------------------
        // ACTIVE ENGINES
        // ------------------------------------------

        if (result.runtime?.length) {

          message += "⚡ Active Engines:\n";

          for (const r of result.runtime) {

            message +=
              `• ${r.engine} → ${
                r.running
                  ? "running ✅"
                  : "offline ❌"
              }\n`;

          }

          message += "\n";

        }

        // ------------------------------------------
        // AVAILABLE TOOLS
        // ------------------------------------------

        if (result.tools?.length) {

          message += "🧰 Available Tools:\n";

          for (const t of result.tools) {

            message +=
              `• ${t.tool} ${
                t.available
                  ? "✅"
                  : "❌"
              }\n`;

          }

          message += "\n";

        }

        // ------------------------------------------
        // SUMMARY
        // ------------------------------------------

        message +=
          "📊 Summary:\n" +

          `• Engines Running: ${
            result.summary?.engines_running || 0
          }/${
            result.summary?.engines_total || 0
          }\n` +

          `• Tools Available: ${
            result.summary?.tools_available || 0
          }/${
            result.summary?.tools_total || 0
          }\n\n` +

          "🟢 System ready for orchestration tasks.";

        // ------------------------------------------
        // SEND MESSAGE
        // ------------------------------------------

        await sendWhatsAppMessage(
          client.phone_number,
          message
        );

        // ------------------------------------------
        // MARK NOTIFIED
        // ------------------------------------------

        await supabaseAdmin
          .from("commands")
          .update({
            notified: true
          })
          .eq("id", cmd.id);

        console.log(
          "✅ Result notification sent:",
          cmd.command_id
        );

      } catch (err) {

        console.error(
          "Notify command failed:",
          err.message
        );

      }

    }

  } catch (err) {

    console.error(
      "Watcher fatal:",
      err.message
    );

  }

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
app.listen(PORT, () => {
  log(`🚀 Server running on port ${PORT}`);
});

// =====================================================
// START COMMAND WATCHER
// =====================================================

setInterval(() => {

  watchCompletedCommands();

}, 5000);

