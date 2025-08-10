// index.js
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = process.env.GROQ_API_URL || "https://api.groq.com/openai/v1";

async function generateReply(prompt) {
  if (!GROQ_API_KEY) {
    console.error("❌ Pa gen GROQ_API_KEY nan anviwònman an!");
    return "Mwen pa ka konekte ak entèlijans la pou kounya, men m ap toujou la pou ede ou.";
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

    if (!res.ok) {
      console.error(`❌ Erè API Groq: ${res.status} ${res.statusText}`);
      return "Mwen pa ka kontakte sèvè pou kounya, men m ap toujou la pou ede ou.";
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "Mwen pa gen repons pou kounya.";
  } catch (error) {
    console.error("❌ generateReply error:", error.message);
    return "Mwen pa ka kontakte sèvè pou kounya, men m ap toujou la pou ede ou.";
  }
}

// Webhook verification
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook to receive messages
app.post("/webhook", async (req, res) => {
  const body = req.body;
  console.log("📩 Received webhook:", JSON.stringify(body, null, 2));

  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const msg = body.entry[0].changes[0].value.messages[0];
      const from = msg.from;
      const text = msg.text?.body || "";

      const reply = await generateReply(text);

      console.log(`💬 Replying to ${from}: ${reply}`);
      // TODO: Add your WhatsApp send message API call here
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
