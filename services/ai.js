// -------------------------------------------
//  AI Service (Groq - Llama 3.1 8B)
// -------------------------------------------

import axios from "axios";
import { config } from "../config.js";
import { getConversation } from "./supabase.js";

function compactClientProfile(customer) {
  if (!customer?.exists) return "PROSPECT: kontak la pa egziste nan tab clients.";
  const record = customer.client || {};
  const allowed = ["name", "full_name", "display_name", "company", "company_name", "organization", "client_type", "customer_type", "type", "role", "status"];
  const fields = {};
  for (const key of allowed) if (record[key] !== undefined && record[key] !== null) fields[key] = record[key];
  return `CLIENT: kontak la egziste nan clients. ${JSON.stringify(fields)}`;
}

function buildSystemPrompt(customer) {
  return `
Ou se operatè konvèsasyon KAYA pou ${config.companyName}.

RESPONSABLITE
Ou sèvi de mòd selon idantite kontak la:
1. ASISTAN KLIYAN: lè kontak la deja kliyan, ede li, eksplike, oryante li, reponn kestyon li epi sèvi bezwen li.
2. AJAN MARKETING / VANT: lè kontak la pa kliyan, prezante ${config.companyName}, eksplike sa li ofri, valè li, itilite li, epi gide moun nan sou pwochen etap la san presyon oswa pwomès ou pa ka verifye.

KONTEKS KONTAK
${compactClientProfile(customer)}

ÒF KONPAYI AN
Non: ${config.companyName}
Deskripsyon: ${config.companyDescription}
Òf: ${config.companyOfferings}
Ton: ${config.companyTone}

RÈG
- Toujou adapte repons lan ak kalite kontak la.
- Pa envante pri, pwodwi, rabè, disponiblite, karakteristik, lyen oswa aksyon ki pa nan kontèks la.
- Lè enfòmasyon espesifik pa disponib, di sa epi mande/oswa eksplike sa ki nesesè.
- Pa konfonn KAYA/NEXUS runtime operator la ak ${config.companyName}: operator la se kanal la; biznis la se sa w ap reprezante.
- Lè w ap fè marketing, pa sèlman reponn kestyon an: montre poukisa sèvis/solisyon an itil epi ki pwoblèm li ka rezoud.
- Lè w ap ede yon kliyan, pa fè pitch marketing initil. Mete sèvis kliyan an an premye.
- Reponn nan lang kliyan an lè sa posib.
- Pa pretann ou se yon moun.
- Pa envante rezilta oswa konfimasyon.
`;
}

export async function generateCustomerReply({ phone, text, customer }) {
  if (!config.groqKey) throw new Error("GROQ_API_KEY is missing.");

  const history = await getConversation(phone, config.conversationLimit);
  const messages = [
    { role: "system", content: buildSystemPrompt(customer) },
    ...history
      .filter(item => item.body)
      .map(item => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.body).slice(0, 1500)
      })),
    { role: "user", content: String(text || "").slice(0, 4000) }
  ];

  const response = await axios.post(
    config.groqUrl,
    { model: config.groqModel, messages, temperature: 0.45, max_tokens: 500 },
    {
      headers: { Authorization: `Bearer ${config.groqKey}`, "Content-Type": "application/json" },
      timeout: config.aiTimeoutMs
    }
  );

  const content = response.data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI returned an empty response.");
  return content;
}

