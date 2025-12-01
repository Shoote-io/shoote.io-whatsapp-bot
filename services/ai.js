// services/ai.js
import axios from "axios";
import { getConversation } from "./supabase.js";

const provider = (process.env.LLM_PROVIDER || "groq").toLowerCase();

export async function initAI() {
  console.log("🧠 AI service initialized (provider:", provider + ")");
}

/* -------------------------------------------
   1️⃣ DETEKSYON SALITASYON / ENTANSYON SANS AI
-------------------------------------------- */

function detectIntent(text) {
  const t = text.trim().toLowerCase();

  const greetings = ["alo", "allo", "salut", "bonjou", "bonswa", "hola", "hey", "hi", "hello"];
  const printKeywords = ["imprime", "printing", "enpresyon", "print", "copie", "scanner", "scan"];

  if (greetings.some(g => t.startsWith(g))) {
    return "greeting";
  }

  if (printKeywords.some(k => t.includes(k))) {
    return "print";
  }

  return "unknown";
}

/* -------------------------------------------
   2️⃣ PROVIDER: GROQ — Latest API
-------------------------------------------- */

async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not set");

  const url = "https://api.groq.com/openai/v1/chat/completions";

  const body = {
    model: "llama-3.1-70b-versatile", // ⭐ modern, stable, fully supported
    messages: [
      { role: "system", content: "Ou se yon asistan WhatsApp calm, pwofesyonèl, e fè kout repons klè." },
      { role: "user", content: prompt }
    ],
    temperature: 0.4,
    max_tokens: 350
  };

  const res = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    }
  });

  return res.data?.choices?.[0]?.message?.content || "";
}

/* -------------------------------------------
   3️⃣ PROVIDER: OpenAI GPT-4o Mini
-------------------------------------------- */

async function callOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const url = "https://api.openai.com/v1/chat/completions";

  const res = await axios.post(
    url,
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional WhatsApp assistant." },
        { role: "user", content: prompt }
      ],
      max_tokens: 350,
      temperature: 0.4
    },
    {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
    }
  );

  return res.data?.choices?.[0]?.message?.content || "";
}

/* -------------------------------------------
   4️⃣ PROVIDER: Claude
-------------------------------------------- */

async function callClaude(prompt) {
  const key = process.env.CLAUDE_API_KEY;
  if (!key) throw new Error("CLAUDE_API_KEY not set");

  const url = "https://api.anthropic.com/v1/messages";

  const res = await axios.post(
    url,
    {
      model: "claude-3-haiku-20240307",
      max_tokens: 350,
      messages: [
        { role: "user", content: prompt }
      ]
    },
    {
      headers: {
        "x-api-key": key,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01"
      }
    }
  );

  return res.data?.content?.[0]?.text || "";
}

/* -------------------------------------------
   5️⃣ GENERATE REPLY WITH CONTEXT + FALLBACKS
-------------------------------------------- */

export async function generateReply(userNumber, userText, history = null) {
  try {
    /* --- 1 : Intent Shortcuts (Super Fast) --- */
    const intent = detectIntent(userText);

    if (intent === "greeting") {
      return "Bonjou 👋! Mwen la pou ede w ak sèvis enpresyon, dokiman, foto ak lòt demann. Kijan mwen ka ede w jodi a?";
    }

    if (intent === "print") {
      return "Pou enpresyon 📄:\n• Voye fichye w la (PDF, Word, Excel)\n• Di m ki kantite paj / koulè\n• E si w vle double-face\nM ap okipe rès la!";
    }

    /* --- 2 : Load historic messages --- */
    const limit = Number(process.env.CONVERSATION_HISTORY_LIMIT || 8);
    const convo = history || (await getConversation(userNumber, limit));

    let prompt = "Konvèsasyon ant itilizatè a ak bot la:\n\n";
    convo.forEach((m) => {
      prompt += `${m.from_number === userNumber ? "User" : "Bot"}: ${m.body}\n`;
    });

    prompt += `User: ${userText}\nBot:`;

    /* --- 3 : Select AI Provider --- */
    if (provider === "groq") return await callGroq(prompt);
    if (provider === "openai") return await callOpenAI(prompt);
    if (provider === "claude") return await callClaude(prompt);

    throw new Error("Unknown LLM_PROVIDER");

  } catch (err) {
    console.error("❌ AI Error:", err.message);
    return "Mwen regrèt — gen yon pwoblèm teknik. Eseye ankò pita 🙏.";
  }
}
