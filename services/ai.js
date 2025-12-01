// services/ai.js
import axios from "axios";
import { getConversation } from "./supabase.js";

// ⚠️ DIRECT HARD-CODED API KEY (if .env fails)
const GROQ_KEY = process.env.GROQ_API_KEY || "YOUR_GROQ_API_KEY_HERE";

// Set provider fixed to "groq"
const provider = "groq";

export async function initAI() {
  console.log("🧠 AI service initialized (provider: groq)");
}

/* -------------------------------------------
   1️⃣ INTENT DETECTION (FAST)
-------------------------------------------- */

function detectIntent(text) {
  const t = text.trim().toLowerCase();

  const greetings = ["alo","allo","salut","bonjou","bonswa","hola","hey","hi","hello"];
  const printKeywords = ["imprime","printing","enpresyon","print","copie","scanner","scan"];

  if (greetings.some(g => t.startsWith(g))) return "greeting";
  if (printKeywords.some(k => t.includes(k))) return "print";
  return "unknown";
}

/* -------------------------------------------
   2️⃣ GROQ — Llama-3.1-8B Model FIXED
-------------------------------------------- */

async function callGroq(prompt) {
  if (!GROQ_KEY) throw new Error("Missing GROQ API key");

  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.1-8b-instant",  // ⭐ FREE, FAST, STABLE
      messages: [
        { role: "system", content: "Ou se yon asistan WhatsApp calm, pwofesyonèl, ak kout repons." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 300
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data?.choices?.[0]?.message?.content || "";
}

/* -------------------------------------------
   3️⃣ REPLY GENERATION WITH HISTORY
-------------------------------------------- */

export async function generateReply(userNumber, userText, history = null) {
  try {
    // --- INTENT SHORTCUTS ---
    const intent = detectIntent(userText);

    if (intent === "greeting")
      return "Bonjou 👋! Kijan mwen ka ede w ak sèvis dokiman oswa enpresyon?";
    if (intent === "print")
      return "Pou enpresyon 📄: Voye fichye w, kantite paj, koulè / N&B, epi double-face si w vle.";

    // --- HISTORY ---
    const limit = Number(process.env.CONVERSATION_HISTORY_LIMIT || 8);
    const convo = history || (await getConversation(userNumber, limit));

    let prompt = "Konvèsasyon ant itilizatè a ak bot la:\n\n";
    convo.forEach((m) => {
      prompt += `${m.from_number === userNumber ? "User" : "Bot"}: ${m.body}\n`;
    });

    prompt += `User: ${userText}\nBot:`;

    // --- ALWAYS GROQ ---
    return await callGroq(prompt);

  } catch (err) {
    console.error("❌ AI ERROR:", err.message);
    return "Gen yon pwoblèm teknik. Eseye ankò pita 🙏.";
  }
}
