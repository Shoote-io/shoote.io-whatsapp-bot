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
      .single();

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

      // 🎬 COMMAND DETECTION (IMPROVED)
if (lower === "run service" || lower === "install tools" || lower === "install workers") {
  log("🎬 ACTION COMMAND DETECTED");

  try {
    const machineId = await getMachineIdByPhone(from);

    if (!machineId) {
      await sendWhatsAppMessage(from, "❌ Machine not linked to this number.");
      return res.sendStatus(200);
    }

    const payload = {
      action: "install_script",
      name: "master-media",
      url: "https://raw.githubusercontent.com/Shoote-io/elmidor-toolkit-control/main/master-media.ps1",
      target: "tools",
      run_after: "media"
    };

    const data = await createCommand({
      machine_id: machineId,
      type: "install_script",
      script_name: payload.name,
      script_url: payload.url,
      target: payload.target,
      status: "pending",
      source_phone: from,
      source_type: "whatsapp",
      payload: payload // ✅ FIX IS HERE
    });

    if (!data) throw new Error("Command creation failed");

    await sendWhatsAppMessage(
      from,
      "✅ Command lan voye. System lan ap prepare media module la..."
    );

  } catch (err) {
    logError("Command insert failed:", err.message);
    await sendWhatsAppMessage(from, "⚠️ Command failed.");
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
