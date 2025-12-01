// -----------------------------------------------
//  WhatsApp AI Bot - Professional Production Build
// -----------------------------------------------

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// --------------------------
//  Load Environment Variables
// --------------------------
const PORT = process.env.PORT || 10000;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = process.env.GROQ_API_URL || "https://api.groq.com/openai/v1";

// --------------------------
//  Small Utility: Safe Logs
// --------------------------
function log(...params) {
  console.log("🟦", ...params);
}

function logError(...params) {
  console.error("⛔", ...params);
}

// --------------------------
//  Generate AI Reply (GROQ)
// --------------------------
async function generateAIReply(prompt) {
  try {
    const response = await fetch(`${GROQ_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mixtral-8x7b-32768",
        messages: [
          { role: "system", content: "Ou se yon asistan pwofesyonèl ki reponn trè klè." },
          { role: "user", content: prompt }
        ],
      }),
    });

    const data = await response.json();

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (text) return text;

    return "Mwen pa jwenn okenn detay nan sèvè AI a pou kounya.";
  } catch (err) {
    logError("AI Error:", err?.message);
    return "Gen yon pwoblèm teknik ak sèvè entèlijans lan.";
  }
}

// -----------------------------
//  Send WhatsApp Message (API)
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
//  VERIFY WEBHOOK (FACEBOOK/META - GET)
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
//  HANDLE WHATSAPP INCOMING MESSAGES (POST)
// -------------------------------------------------
app.post("/webhook", async (req, res) => {
  const body = req.body;

  log("📩 INCOMING:", JSON.stringify(body, null, 2));

  // Validate format
  if (body.object !== "whatsapp_business_account") {
    return res.sendStatus(404);
  }

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];

  if (!message) {
    // No user message — status updates, delivery reports, etc.
    return res.sendStatus(200);
  }

  const from = message.from;

  // -------------------------
  // Handle Text Message
  // -------------------------
  if (message.type === "text") {
    const userText = message.text.body;

    log("📝 User Message:", userText);

    // Add soft routing rules
    const lower = userText.toLowerCase();

    if (["hi", "hello", "salut", "bonjour", "hola", "alo"].some(x => lower.includes(x))) {
      await sendWhatsAppMessage(from, "Bonjou! Kijan mwen ka ede w jodi a?");
      return res.sendStatus(200);
    }

    if (lower.includes("prix") || lower.includes("price") || lower.includes("pri")) {
      await sendWhatsAppMessage(from,
        "Pou enpresyon, pri yo depann de kalite travay ou vle fè. Ki tip enpresyon ou bezwen? (kado, kat biznis, afich, logo, bannè, elatriye)"
      );
      return res.sendStatus(200);
    }

    // Default → AI reply
    const reply = await generateAIReply(userText);
    await sendWhatsAppMessage(from, reply);

    return res.sendStatus(200);
  }

  // -------------------------
  // Handle Image
  // -------------------------
  if (message.type === "image") {
    await sendWhatsAppMessage(
      from,
      "Mwen resevwa foto a. Si ou bezwen analiz oswa enpresyon, explike mwen plis sou objektif ou."
    );
    return res.sendStatus(200);
  }

  // -------------------------
  // Other types
  // -------------------------
  await sendWhatsAppMessage(
    from,
    `Mwen resevwa yon mesaj tip *${message.type}*. Kijan mwen ka ede ou?`
  );

  return res.sendStatus(200);
});

// --------------------------
//  Start Server
// --------------------------
app.listen(PORT, () => {
  log(`🚀 Server is running on port ${PORT}`);
});
