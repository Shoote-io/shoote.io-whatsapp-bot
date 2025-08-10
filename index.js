// index.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { initSupabase } from "./services/supabase.js";
import { initAI } from "./services/ai.js";
import { initWhatsApp, handleIncomingWebhook } from "./services/whatsapp.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

app.get("/", (req, res) => res.send("WhatsApp AI Bot alive"));

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ Webhook verified");
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
  res.sendStatus(400);
});

app.post("/webhook", async (req, res) => {
  // quick ack to avoid timeouts
  res.sendStatus(200);
  // process in background
  try {
    await handleIncomingWebhook(req.body);
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
});

async function start() {
  console.log("🚀 Starting WhatsApp AI Bot...");
  await initSupabase(); // will warn if not configured, but doesn't crash
  await initAI();
  await initWhatsApp();
  app.listen(PORT, () => console.log(`🌐 Listening on port ${PORT}`));
}

start().catch((e) => {
  console.error("Fatal start error:", e);
  process.exit(1);
});
