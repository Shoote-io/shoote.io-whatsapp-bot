
// -------------------------------------------
// AI Service - Groq
// -------------------------------------------

import axios from "axios";
import { config } from "../config.js";
import { getConversation } from "./supabase.js";

function compactClientProfile(customer) {
  if (!customer?.exists) {
    return {
      mode: "SALES_MARKETING",
      profile: "PROSPECT: kontak la pa egziste nan tab clients."
    };
  }

  const record = customer.client || {};

  const allowed = [
    "name",
    "full_name",
    "display_name",
    "company",
    "company_name",
    "organization",
    "client_type",
    "customer_type",
    "type",
    "role",
    "status"
  ];

  const fields = {};

  for (const key of allowed) {
    if (record[key] !== undefined && record[key] !== null) {
      fields[key] = record[key];
    }
  }

  return {
    mode: "CUSTOMER_ASSISTANT",
    profile: `CLIENT: kontak la egziste nan clients. ${JSON.stringify(fields)}`
  };
}

function buildSystemPrompt(customer) {
  const identity = compactClientProfile(customer);

  return `
Ou se operatè konvèsasyon KAYA pou ${config.companyName}.

MODE KONVÈSASYON
${identity.mode}

KONTEKS KONTAK
${identity.profile}

RESPONSABLITE

Si MODE = CUSTOMER_ASSISTANT:
- Sèvi kliyan an an premye.
- Reponn kestyon li klèman.
- Ede li konprann sèvis, pwosesis oswa solisyon ki konsène li.
- Bay eksplikasyon itil lè sa nesesè.
- Pa fè pitch marketing initil.
- Si kestyon an mande enfòmasyon ki pa disponib, di sa klèman.
- Pa envante aksyon, pri, rezilta, pwodwi oswa konfimasyon.

Si MODE = SALES_MARKETING:
- Prezante ${config.companyName} klèman.
- Eksplike sa konpayi an ofri.
- Eksplike pwoblèm sèvis yo ka rezoud.
- Montre valè ak itilite solisyon yo.
- Lè sa apwopriye, gide prospect la sou pwochen etap la.
- Pa fè presyon.
- Pa envante pri, rabè, disponiblite, karakteristik oswa rezilta.
- Pa sèlman reponn kestyon an si yon eksplikasyon sou valè sèvis la nesesè pou konprann repons lan.

ENFÒMASYON KONPAYI AN

Non: ${config.companyName}
Deskripsyon: ${config.companyDescription}
Òf: ${config.companyOfferings}
Ton: ${config.companyTone}

RÈG JENERAL

- Adapte repons lan ak MODE ki bay anlè a.
- Reponn nan lang kliyan an lè sa posib.
- Pa pretann ou se yon moun.
- Pa envante enfòmasyon.
- Pa envante pri, pwodwi, rabè, lyen, disponiblite oswa rezilta.
- Lè enfòmasyon espesifik pa disponib, di sa.
- KAYA/NEXUS se operator la. ${config.companyName} se konpayi/operator business la w ap reprezante.
- Repons yo dwe natirèl, klè, itil epi dirèk.
`;
}

function normalizeHistory(history = [], currentText = "") {
  const current = String(currentText || "").trim();

  return history
    .filter(item => item?.body)
    .map(item => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.body).slice(0, 1500)
    }))
    .filter(item => {
      // Evite ajoute menm mesaj entrant lan de fwa si getConversation()
      // deja retounen mesaj aktyèl la.
      return !(item.role === "user" && item.content === current);
    });
}

export async function generateCustomerReply({ phone, text, customer }) {
  if (!config.groqKey) {
    throw new Error("GROQ_API_KEY_MISSING");
  }

  if (!config.groqUrl) {
    throw new Error("GROQ_API_URL_MISSING");
  }

  if (!config.groqModel) {
    throw new Error("GROQ_MODEL_MISSING");
  }

  const currentText = String(text || "").trim();

  if (!currentText) {
    throw new Error("EMPTY_INCOMING_MESSAGE");
  }

  let history;

  try {
    history = await getConversation(
      phone,
      config.conversationLimit
    );
  } catch (error) {
    throw new Error(
      `CONVERSATION_CONTEXT_FAILED: ${
        error?.message || "unknown error"
      }`
    );
  }

  const messages = [
    {
      role: "system",
      content: buildSystemPrompt(customer)
    },
    ...normalizeHistory(history, currentText),
    {
      role: "user",
      content: currentText.slice(0, 4000)
    }
  ];

  let response;

  try {
    response = await axios.post(
      config.groqUrl,
      {
        model: config.groqModel,
        messages,
        temperature: 0.45,
        max_tokens: 500
      },
      {
        headers: {
          Authorization: `Bearer ${config.groqKey}`,
          "Content-Type": "application/json"
        },
        timeout: config.aiTimeoutMs
      }
    );
  } catch (error) {
    const status = error?.response?.status ?? "NO_STATUS";
    const providerMessage =
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      error?.message ||
      "Unknown provider error";

    throw new Error(
      `GROQ_REQUEST_FAILED status=${status} message=${providerMessage}`
    );
  }

  const content =
    response?.data?.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("GROQ_EMPTY_RESPONSE");
  }

  return content;
}
