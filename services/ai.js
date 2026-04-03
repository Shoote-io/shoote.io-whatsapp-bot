// -------------------------------------------
//  AI Service (Groq - Llama 3.1 8B)
// -------------------------------------------

import axios from "axios";

const GROQ_KEY = process.env.GROQ_API_KEY;
const API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function generateAIReply(userText, options = {}) {
  try {
    if (!GROQ_KEY) {
      console.error("Missing GROQ_API_KEY!");
      return "Konfigirasyon AI a pa anfòm kounye a.";
    }

    const { isCommand = false } = options;

    // COMMAND BYPASS (let system handle commands)
    if (isCommand) {
      return null;
    }

    // limit input size (performance)
    const safeText = (userText || "").slice(0, 500);

    const response = await axios.post(
      API_URL,
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `
Ou se yon asistan pwofesyonel Elmidor Group. Ou reponn senp, kle, kout, pwofesyonel, epi ou ede moun antre rapid nan challenge la.

INFO OFISYEL OU DWE SERVI

Elmidor Group:
- Antrepriz ki devlope workflow, otomasyon, formasyon ak zouti pou jen antreprenè ak enfliyansè.
- Sit ofisyel: https://www.elmidorgroup.com

Elmidor Influence & Entrepreneurship Challenge (Desanm 2025):
- Challenge seleksyon pou jen antreprenè ak enfliyansè.
- Chak round dire 72h.
- Objektif patisipan an nan chak round:
  - 15 moun ranpli fom pèsonel li
  - 3 envite antre nan challenge la
  - 1 moun enterese nan workflow Elmidor Group
- Chak round reyisi = 20 USD.
- Fom enskripsyon ofisyel: https://tally.so/r/Zj9A1z
`
          },
          { role: "user", content: safeText }
        ],
        temperature: 0.7,
        max_tokens: 300
      },
      {
        headers: {
          Authorization: `Bearer ${GROQ_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    const content = response?.data?.choices?.[0]?.message?.content;

    if (!content) {
      console.warn("AI empty response");
      return "Mwen pa jwenn repons nan AI a.";
    }

    return content.trim();

  } catch (error) {
    console.error("AI Error:", error.response?.data || error.message);
    return "Gen yon pwoblèm ak sèvè AI a.";
  }
}
