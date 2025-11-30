// index.js
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// ENV VARS
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = process.env.GROQ_API_URL || "https://api.groq.com/openai/v1";

// Generate AI reply
async function generateReply(prompt) {
  if (!GROQ_API_KEY) {
    console.error("❌ Pa gen GROQ_API_KEY nan anviwònman an!");
    return "Mwen pa ka konekte ak sèvè entèlijans lan kounya.";
  }

  try {
    const res = await fetch(`${GROQ_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mixtral-8x7b-32768",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "Mwen pa jwenn repons pou kounya.";
  } catch (error) {
    console.error("❌ generateReply error:", error.message);
    return "Gen yon ti pwoblèm teknik, tanpri eseye ankò.";
  }
}

// WhatsApp send message wrapper
async function sendWhatsAppMessage(to, message) {
  try {
    await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        text: { body: message },
      }),
    });
  } catch (err) {
    console.error("❌ WhatsApp send error:", err.message);
  }
}

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

// Incoming messages
app.post("/webhook", async (req, res) => {
  const body = req.body;
  console.log("📩 Received:", JSON.stringify(body, null, 2));

  if (body.object === "whatsapp_business_account") {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const msg = changes?.value?.messages?.[0];

    if (msg) {
      const from = msg.from;

      // If it's text message
      if (msg.type === "text") {
        const text = msg.text.body;
        const reply = await generateReply(text);
        await sendWhatsAppMessage(from, reply);
      }

      // If it's image
      else if (msg.type === "image") {
        await sendWhatsAppMessage(
          from,
          "Mwen resevwa foto ou. Kijan mwen ka ede w ak li?"
        );
      }

      // If it's audio, video, document, etc.
      else {
        await sendWhatsAppMessage(
          from,
          `Mwen resevwa mesaj tip: ${msg.type}. Kijan mwen ka ede ou?`
        );
      }
    }

    return res.sendStatus(200);
  }

  res.sendStatus(404);
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
