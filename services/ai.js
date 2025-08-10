// services/ai.js
import axios from "axios";
import { getConversation } from "./supabase.js";

const provider = (process.env.LLM_PROVIDER || "groq").toLowerCase();

export async function initAI() {
  console.log("🧠 AI service initialized (provider:", provider, ")");
}

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");
  const url = "https://api.groq.ai/v1/generate";
  const res = await axios.post(
    url,
    { model: "mixtral-8x7b", input: prompt, max_output_tokens: 300 },
    { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } }
  );
  return res.data?.output?.[0]?.content || res.data?.text || "";
}

async function callClaude(prompt) {
  const key = process.env.CLAUDE_API_KEY;
  if (!key) throw new Error("CLAUDE_API_KEY not set");
  const url = "https://api.anthropic.com/v1/complete";
  const res = await axios.post(
    url,
    { model: "claude-2.1", prompt, max_tokens_to_sample: 400 },
    { headers: { "x-api-key": key, "Content-Type": "application/json" } }
  );
  return res.data?.completion || "";
}

async function callOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  const url = "https://api.openai.com/v1/chat/completions";
  const res = await axios.post(
    url,
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant for WhatsApp support." },
        { role: "user", content: prompt }
      ],
      max_tokens: 300
    },
    { headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } }
  );
  return res.data?.choices?.[0]?.message?.content || "";
}

export async function generateReply(userNumber, incomingText, history = null) {
  try {
    const limit = Number(process.env.CONVERSATION_HISTORY_LIMIT || 8);
    const convo = history || (await getConversation(userNumber, limit));
    let prompt = "Conversation:\n";
    convo.forEach((m) => {
      // the messages table stores from_number and body
      prompt += `${m.from_number === userNumber ? "User" : "Bot"}: ${m.body}\n`;
    });
    prompt += `User: ${incomingText}\nBot:`;
    if (provider === "groq") return await callGroq(prompt);
    if (provider === "claude") return await callClaude(prompt);
    if (provider === "openai") return await callOpenAI(prompt);
    throw new Error("Unknown LLM_PROVIDER");
  } catch (err) {
    console.error("generateReply error:", err.message || err);
    return "Mwen regrèt — gen yon erè. Tanpri eseye ankò pita.";
  }
}
