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
  uploadMediaToStorage
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

// --------------------------
//  Init Supabase
// --------------------------
initSupabase();

// -----------------------------
//  Send WhatsApp Message
// -----------------------------
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

    // Save bot reply
    await saveReply({
      to_number: to,
      body: message,
      media_url: null
    });

    log("📤 Message sent →", to);
  } catch (err) {
    logError("WhatsApp Send Error:", err?.message);
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
//  HANDLE INCOMING WHATSAPP MESSAGES
// -------------------------------------------------
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object !== "whatsapp_business_account") {
    return res.sendStatus(404);
  }

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];
  const from = message?.from;

  if (!message) return res.sendStatus(200);

  // -------------------------
  // 1. HANDLE TEXT MESSAGE
  // -------------------------
  if (message.type === "text") {
    const text = message.text.body;

    await saveMessage({
      from_number: from,
      body: text,
      media_url: null,
      media_mime: null,
      raw: message
    });

    const lower = text.toLowerCase();

    if (["hi", "hello", "salut", "bonjour", "hola", "alo"].some(x => lower.includes(x))) {
      await sendWhatsAppMessage(from, "Bonjou! Kijan mwen ka ede w jodi a?");
      return res.sendStatus(200);
    }

    if (lower.includes("pri") || lower.includes("price") || lower.includes("prix")) {
      await sendWhatsAppMessage(
        from,
        "Pou enpresyon, pri yo depann de kalite travay la. Ki tip enpresyon ou bezwen? (kat biznis, bannè, logo, elatriye)."
      );
      return res.sendStatus(200);
    }

    const aiReply = await generateAIReply(text);
    await sendWhatsAppMessage(from, aiReply);

    return res.sendStatus(200);
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

    const filename = `whatsapp/${from}/${Date.now()}.jpg`;
    let publicUrl = null;

    try {
      // Try upload – BUT DO NOT STOP IF FAILS
      publicUrl = await uploadMediaToStorage(filename, buffer, mimeType);
      console.log("✔ Uploaded:", filename);
    } catch (uploadErr) {
      console.error("🔥 Upload failed BUT CONTINUING:", uploadErr.message);
    }

    // STEP 3 — Save message log, EVEN IF UPLOAD FAIL
    await saveMessage({
      from_number: from,
      body: null,
      media_url: publicUrl, // might be null
      media_mime: mimeType,
      raw: message
    });

    // STEP 4 — ALWAYS reply
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

    // Even crash-level fail → bot still replies
    await sendWhatsAppMessage(
      from,
      "Nou resevwa mesaj ou! Si gen pwoblèm ak fichye a, nou ap verifye li. ✔"
    );
  }

  return res.sendStatus(200);
}

  // -------------------------
// Image
// -------------------------
if (message.type === "image") {
  try {
    // Extract image ID
    const mediaId = message.image.id;

    // Get meta info
    const info = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      }
    ).then(r => r.json());

    const mediaUrl = info.url;
    const mimeType = info.mime_type || "image/jpeg";

    // Download the image buffer
    const buffer = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    }).then(r => r.arrayBuffer());

    // Upload →
    const filename = `wa_${Date.now()}.jpg`;

    try {
      await uploadMediaToStorage(filename, Buffer.from(buffer), mimeType);
      console.log("✅ Media uploaded:", filename);
    } catch (uploadErr) {
      console.error("🔥 Media upload failed:", uploadErr.message);
      // BUT DON’T STOP THE BOT
    }

  } catch (err) {
    console.error("⛔ Image processing failed but flow continues:", err?.message);
  }

  // ALWAYS send reply even after media failure
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
