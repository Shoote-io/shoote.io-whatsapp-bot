
// -----------------------------------------------
//  WhatsApp AI Bot - Restored & Structured Version
//  (Supabase Logging + Robust Error Handling)
// -----------------------------------------------
import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import { config } from "./config.js";
import { initSupabase, saveMessage, createCommand, getMachineInfo } from "./services/supabase.js";
import { initWhatsApp, handleIncomingWebhook, sendTextMessage, persistIncomingMedia } from "./services/whatsapp.js";
import { resolveCustomer } from "./services/customer.js";
import { generateCustomerReply } from "./services/ai.js";
import { parseCommand, buildNexusCommand } from "./services/command.js";
import { startResponseDeliveryWorker, stopResponseDeliveryWorker } from "./services/response-delivery.js";

const app = express();
app.use(bodyParser.json({ limit: "2mb" }));

const log = (...args) => console.log(`[KAYA-OPERATOR]`, ...args);
const error = (...args) => console.error(`[KAYA-OPERATOR]`, ...args);


async function handleText({ from, text }) {
  if (!text) return;

  const parsed = parseCommand(text);
  const command = buildNexusCommand(parsed);

  if (command) {
    try {
      const customer = await resolveCustomer(from);
      const machineId = customer.client?.machine_id || null;

      if (!machineId) {
        await sendTextMessage(
          from,
          "Mwen resevwa kòmand Nexus la, men kontak sa a pa gen yon machine ki asosye nan clients. Kòmand lan pa voye nan runtime pou evite egzekisyon sou move machin."
        );
        return;
      }

      await createCommand({
        ...command,
        machine_id: machineId,
        reply_context: {
          phone_number: from,
          customer_type: customer.type,
          customer_exists: customer.exists
        }
      });

      if (command.intent === "machine" && command.operation === "status") {
        const machine = await getMachineInfo(machineId);
        if (!machine) {
          await sendTextMessage(from, "Kòmand machine status la antre nan Nexus, men telemetry machin nan poko disponib.");
          return;
        }

        const telemetry = typeof machine.telemetry === "string"
          ? safeJson(machine.telemetry)
          : (machine.telemetry || {});

        const cpu = telemetry?.hardware?.CPU?.NAME || "Unknown CPU";
        const cores = telemetry?.hardware?.CPU?.CORES ?? "?";
        const threads = telemetry?.hardware?.CPU?.THREADS ?? "?";
        const ram = telemetry?.hardware?.MEMORY?.TOTAL_GB ?? "?";
        const total = telemetry?.storage?.total_gb ?? "?";
        const used = telemetry?.storage?.used_gb ?? "?";
        const free = telemetry?.storage?.free_gb ?? "?";

        await sendTextMessage(from, [
          "🖥️ *Elmidor Nexus • Machine Status*",
          "",
          `🧠 Hostname: *${machine.hostname || "UNKNOWN"}*`,
          `📍 Machine: *${machine.computer_name || "UNKNOWN"}*`,
          `🟢 Status: *${String(machine.status || "offline").toUpperCase()}*`,
          `🛡️ Integrity: *${String(machine.integrity || "unknown").toUpperCase()}*`,
          `🔐 Trust: *${String(machine.trust_level || "unknown").toUpperCase()}*`,
          "",
          `⚙️ Runtime: ${machine.runtime_version || "N/A"}`,
          `🚀 Bootstrap: ${machine.bootstrap_version || "N/A"}`,
          `💻 CPU: ${cpu}`,
          `🧩 Cores/Threads: ${cores}/${threads}`,
          `🧠 RAM: ${ram} GB`,
          "",
          "💾 Storage:",
          `• Total: ${total} GB`,
          `• Used: ${used} GB`,
          `• Free: ${free} GB`,
          "",
          `❌ Execution failures: ${machine.execution_failures || 0}`,
          `🕒 Last heartbeat: ${machine.last_heartbeat || "Unknown"}`
        ].join("\n"));
        return;
      }

      await sendTextMessage(from, [
        "✅ *Kòmand Nexus aksepte*",
        "",
        `🧠 Intent: ${command.intent}`,
        `⚙️ Operation: ${command.operation}`,
        `🎯 Target: ${command.target || "none"}`,
        "",
        "📦 Status: queued nan runtime."
      ].join("\n"));
      return;
    } catch (err) {
      error("command handling:", err.message);
      await sendTextMessage(from, "⚠️ Mwen pa t kapab antre kòmand lan nan orchestration Nexus la. Gade log operator la pou erè egzak la.");
      return;
    }
  }

  try {
    const customer = await resolveCustomer(from);
    const reply = await generateCustomerReply({ phone: from, text, customer });
    await sendTextMessage(from, reply);
  } catch (err) {
    error("AI conversation:", err.message);
    await sendTextMessage(from, "Mwen resevwa mesaj ou a, men sèvis repons lan gen yon pwoblèm teknik kounye a. Mesaj la pa pèdi.");
  }
}

function safeJson(value) {
  try { return JSON.parse(value); } catch { return {}; }
}

async function handleMedia({ from, type, message }) {
  try {
    const media = await persistIncomingMedia({ from, type, message });

    if (type === "image") {
      await sendTextMessage(from, `Mwen resevwa imaj ou a epi mwen anrejistre li. Si ou bezwen nou sèvi avè l pou yon sèvis oswa yon demann espesifik, eksplike sa ou bezwen fè ak li.`);
      return;
    }

    await sendTextMessage(from, `Mwen resevwa fichye ${type} la epi mwen anrejistre li.`);
  } catch (err) {
    error(`media ${type}:`, err.message);
    await sendTextMessage(from, "Mwen resevwa mesaj/fichye a, men mwen pa t kapab trete fichye a kounye a.");
  }
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "kaya-nexus-operator",
    version: "2.0.0",
    status: "online",
    delivery_worker: "active"
  });
});

app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === config.verifyToken
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  // Acknowledge Meta immediately. Processing continues after the
  // HTTP response so slow AI/media work cannot make the webhook look dead.
  res.sendStatus(200);

  try {
    if (req.body?.object !== "whatsapp_business_account") return;

    await handleIncomingWebhook(
      req.body,
      async ({ from, text, message }) => {
        await handleText({ from, text, message });
      },
      async ({ from, type, message }) => {
        await handleMedia({ from, type, message });
      }
    );
  } catch (err) {
    error("webhook processing:", err.message);
  }
});

let server;

function shutdown(signal) {
  log(`${signal} received; shutting down.`);
  stopResponseDeliveryWorker();
  if (server) {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  } else {
    process.exit(0);
  }
}

async function main() {
  initSupabase();
  initWhatsApp();

  server = app.listen(config.port, () => {
    log(`online version=2.0.0 port=${config.port}`);
    startResponseDeliveryWorker();
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((err) => {
  error("fatal startup:", err.message);
  process.exit(1);
});
