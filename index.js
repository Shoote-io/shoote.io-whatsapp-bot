// -----------------------------------------------
//  WhatsApp AI Bot - With Supabase Logging
// -----------------------------------------------

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { generateAIReply } from "./services/ai.js";
import {
  initSupabase,
  saveMessage,
  saveReply,
  uploadMediaToStorage,
  saveMediaLog,          // ➕ ADD
  processMediaUpload
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
// Logs
// --------------------------
const log = (...x) => console.log("🟦", ...x);
const logError = (...x) => console.error("⛔", ...x);

// --------------------------
// Init Supabase
// --------------------------
initSupabase();

// --------------------------
// Send WhatsApp Message
// --------------------------
async function sendWhatsAppMessage(to, message) {
  try {
    await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        text: { body: message },
      }),
    });

    await saveReply({
      to_number: to,
      body: message,
      media_url: null,
    });

    log("📤 Message sent →", to);
  } catch (err) {
    logError("WhatsApp Send Error:", err?.message);
  }
}

// --------------------------
// VERIFY WEBHOOK
// --------------------------
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
//HANDLE INCOMING WHATSAPP MESSAGES 
// ------------------------------------------------- 
app.post("/webhook", async (req, res) => { 
  const body = req.body; 
  if (body.object !==
"whatsapp_business_account") { 
    return res.sendStatus(404); 
  } 
const from = message?.from; 
if (!message) return res.sendStatus(200);
// --------------------------
// CORE HANDLER
// --------------------------
async function handleWebhook(body) {

  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return;

  const from = message.from;

  const text = message.text?.body;

  if (text) {

    const clean = text.trim().toLowerCase();

    log("TEXT DETECTED →", `"${clean}"`);
    log("MESSAGE TYPE →", message.type);
  }
  try {
    const { error: insertError } = await supabase
      .from("messages")
      .insert([
        {
          message_id: messageId,
          from_number: from,
          body: messageBody || null,
          media_url: null,
          media_mime: null,
          raw: message,
          role: "user"
        }
      ]);

    if (insertError) {
      log("⚠ Duplicate ignored →", messageId);
      return;
    }

    log("📩 New message →", `"${messageBody}"`);

    if (messageBody === "action") {
      log("🎬 COMMAND RECEIVED");

      await supabase
        .from("commands")
        .insert([{ type: "action", status: "pending" }]);

      await sendWhatsAppMessage(from, "✅ Alert detected");
      return;
    }

    const lower = messageBody;

    if (["hi", "hello", "salut", "bonjour", "hola", "alo"]
          .some(x => lower.includes(x))) {
      await sendWhatsAppMessage(from, "Bonjou! Kijan mwen ka ede w jodi a?");
      return;
    }

    if (lower.includes("pri") || lower.includes("price") || lower.includes("prix")) {
      await sendWhatsAppMessage(from, "Pou enpresyon, pri yo depann...");
      return;
    }

    const aiReply = await generateAIReply(text);
    await sendWhatsAppMessage(from, aiReply);

  } catch (err) {
    logError("Webhook Processing Error:", err?.message);
  }
}
         
// -------------------------
// 2. HANDLE IMAGE MESSAGE
// -------------------------
if (message.type === "image") {
  try {
    const mediaId = message.image.id;

    // Step 1 – Fetch media metadata
    const mediaResp = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });
    const meta = await mediaResp.json();

    const mediaUrl = meta.url;
    const mimeType = meta.mime_type || "image/jpeg";

    // Step 2 – Download file binary
    const raw = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });
    const buffer = Buffer.from(await raw.arrayBuffer());

    // Step 3 – Upload + Log
    const filename = `${Date.now()}.jpg`;

    const mediaRecord = await processMediaUpload(
      from,
      filename,
      buffer,
      mimeType
    );

    const publicUrl = mediaRecord?.public_url || null;

    // Step 4 – Save incoming message log
    await saveMessage({
  message_id: message.id,
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
    console.error("🔥 Fatal error in image handling BUT BOT LIVES:", err.message);

    await sendWhatsAppMessage(
      from,
      "Nou resevwa mesaj ou! Si gen pwoblèm ak fichye a, nou ap verifye li. ✔"
    );
  }
  return res.sendStatus(200);
  }
  // -------------------------
  // OTHER TYPES
  // -------------------------
  await saveMessage({
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
});

// --------------------------
//  Start Server
// --------------------------
app.listen(PORT, () => {
  log(`🚀 Server running on port ${PORT}`);
});
