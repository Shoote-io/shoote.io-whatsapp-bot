import "dotenv/config";

export const config = Object.freeze({
  port: Number(process.env.PORT || 10000),
  verifyToken: process.env.VERIFY_TOKEN || "",
  whatsappToken: process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || "",
  phoneNumberId: process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  graphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v21.0",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  groqKey: process.env.GROQ_API_KEY || "",
  groqUrl: process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions",
  groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
  mediaBucket: process.env.SUPABASE_MEDIA_BUCKET || "ElmidorGroup",
  deliveryPollMs: Math.max(1000, Number(process.env.RESPONSE_DELIVERY_POLL_MS || 3000)),
  deliveryBatchSize: Math.max(1, Math.min(100, Number(process.env.RESPONSE_DELIVERY_BATCH_SIZE || 25))),
  deliveryStaleAfterMs: Math.max(10000, Number(process.env.RESPONSE_DELIVERY_STALE_MS || 120000)),
  aiTimeoutMs: Math.max(3000, Number(process.env.AI_TIMEOUT_MS || 15000)),
  conversationLimit: Math.max(1, Math.min(30, Number(process.env.CONVERSATION_LIMIT || 10))),
  companyName: process.env.COMPANY_NAME || "Elmidor Group",
  companyDescription: process.env.COMPANY_DESCRIPTION || "yon biznis ak solisyon ak sèvis dijital/krèatif ki fèt pou ede kliyan yo reyalize objektif yo.",
  companyOfferings: process.env.COMPANY_OFFERINGS || "sèvis ak pwodwi konpayi an, selon bezwen kliyan an.",
  companyTone: process.env.COMPANY_TONE || "pwofesyonèl, klè, itil, natirèl ak oryante sou valè kliyan an."
});
