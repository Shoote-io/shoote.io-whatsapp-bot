// -----------------------------------------------
//  WhatsApp AI Bot - Professional Production Build
// -----------------------------------------------

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { generateAIReply } from "./services/ai.js";

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
//  Utility Logs
// --------------------------
function log(...params) {
  console.log("🟦", ...params);
}

function logError(...params) {
  console.error("⛔", ...params);
}

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

    log("📤 Message sent →", to);
  } catch (err) {
    logError("WhatsApp Send Error:", err?.message);
  }
}

// -------------------------------------------------
//  VERIFY WEBHOOK (META)
// -------------------------------------------------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    log("✅ Webhook successfully verified");
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

  if (!message) return res.sendStatus(200);

  const from = message.from;

  // -------------------------
  // Text Message
  // -------------------------
  if (message.type === "text") {
    const text = message.text.body;
    const lower = text.toLowerCase();

    log("📝 User:", text);

    // Quick routing
    if (["hi","hello","salut","bonjour","hola","alo"].some(x => lower.includes(x))) {
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

    // AI Response
    const aiReply = await generateAIReply(text);
    await sendWhatsAppMessage(from, aiReply);

    return res.sendStatus(200);
  }

  // -------------------------
  // Image
  // -------------------------
  if (message.type === "image") {
    await sendWhatsAppMessage(
      from,
      "Mwen resevwa foto a. Si ou bezwen analiz oswa enpresyon, fè mwen konnen sa ou bezwen."
    );
    return res.sendStatus(200);
  }

  // -------------------------
  // Other message types
  // -------------------------
  await sendWhatsAppMessage(from, `Mwen resevwa yon mesaj tip *${message.type}*.`);

  return res.sendStatus(200);
});

// --------------------------
//  Start Server
// --------------------------
app.listen(PORT, () => {
  log(`🚀 Server running on port ${PORT}`);
});
