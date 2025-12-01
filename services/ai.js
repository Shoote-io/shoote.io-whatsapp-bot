// -------------------------------------------
//  AI Service (Groq - Llama 3.1 8B)
// -------------------------------------------

import axios from "axios";

const GROQ_KEY = process.env.GROQ_API_KEY;
const API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function generateAIReply(userText) {
  try {
    if (!GROQ_KEY) {
      console.error("Missing GROQ_API_KEY!");
      return "Konfigirasyon AI a pa anfòm kounye a.";
    }

    const response = await axios.post(
      API_URL,
      {
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "Ou se yon asistan pwofesyonèl ki reponn senp, klè ak kout." },
          { role: "user", content: userText }
        ],
        temperature: 0.4,
        max_tokens: 300
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data?.choices?.[0]?.message?.content?.trim()
      || "Mwen pa jwenn repons nan AI a.";
  } catch (error) {
    console.error("AI Error:", error.message);
    return "Gen yon pwoblèm ak sèvè AI a.";
  }
}
