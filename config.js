
// -------------------------------------------
// KAYA NEXUS OPERATOR
// Central Configuration
// -------------------------------------------

import "dotenv/config";

function envNumber(name, fallback, min, max = Infinity) {
  const value = Number(process.env[name] || fallback);

  if (!Number.isFinite(value)) return fallback;

  return Math.min(max, Math.max(min, value));
}

function normalizeGroqUrl(value) {
  const fallback =
    "https://api.groq.com/openai/v1/chat/completions";

  const url = String(value || fallback).trim().replace(/\/+$/, "");

  if (
    url === "https://api.groq.com" ||
    url === "https://api.groq.com/openai/v1"
  ) {
    return `${url}/chat/completions`;
  }

  return url;
}

export const config = Object.freeze({

  // SERVER
  port: envNumber("PORT", 10000, 1, 65535),

  // WHATSAPP SECURITY
  verifyToken: process.env.VERIFY_TOKEN || "",

  whatsappToken:
    process.env.WHATSAPP_TOKEN ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    "",

  phoneNumberId:
    process.env.PHONE_NUMBER_ID ||
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    "",

  graphVersion:
    process.env.WHATSAPP_GRAPH_VERSION || "v21.0",

  // SUPABASE
  supabaseUrl: process.env.SUPABASE_URL || "",

  supabaseAnonKey:
    process.env.SUPABASE_ANON_KEY || "",

  supabaseServiceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  // GROQ AI
  groqKey:
    process.env.GROQ_API_KEY?.trim() || "",

  groqUrl: normalizeGroqUrl(
    process.env.GROQ_API_URL
  ),

  groqModel:
    process.env.GROQ_MODEL?.trim() ||
    "openai/gpt-oss-20b",

  // MEDIA
  mediaBucket:
    process.env.SUPABASE_MEDIA_BUCKET || "ElmidorGroup",

  // RESPONSE DELIVERY
  deliveryPollMs: envNumber(
    "RESPONSE_DELIVERY_POLL_MS",
    3000,
    1000
  ),

  deliveryBatchSize: envNumber(
    "RESPONSE_DELIVERY_BATCH_SIZE",
    25,
    1,
    100
  ),

  deliveryStaleAfterMs: envNumber(
    "RESPONSE_DELIVERY_STALE_MS",
    120000,
    10000
  ),

  // AI EXECUTION
  aiTimeoutMs: envNumber(
    "AI_TIMEOUT_MS",
    30000,
    3000
  ),

  conversationLimit: envNumber(
    "CONVERSATION_LIMIT",
    10,
    1,
    30
  ),

  // COMPANY IDENTITY
  companyName:
    process.env.COMPANY_NAME || "Elmidor Group",

  companyDescription:
    process.env.COMPANY_DESCRIPTION ||
    "yon biznis ak solisyon ak sèvis dijital/krèatif ki fèt pou ede kliyan yo reyalize objektif yo.",

  companyOfferings:
    process.env.COMPANY_OFFERINGS ||
    "sèvis ak pwodwi konpayi an, selon bezwen kliyan an.",

  companyTone:
    process.env.COMPANY_TONE ||
    "pwofesyonèl, klè, itil, natirèl ak oryante sou valè kliyan an."
});
