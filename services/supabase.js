import { createClient } from "@supabase/supabase-js";

// Kreye koneksyon ak Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

/**
 * Ranmase yon konvèsasyon pa ID
 * @param {string} conversationId - ID konvèsasyon an
 */
export async function getConversation(conversationId) {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (error) {
    console.error("❌ Erè getConversation:", error);
    return null;
  }

  return data;
}

/**
 * Sove oswa mete ajou yon konvèsasyon
 * @param {object} conversationData - Done konvèsasyon an
 */
export async function saveConversation(conversationData) {
  const { data, error } = await supabase
    .from("conversations")
    .upsert(conversationData, { onConflict: ["id"] })
    .select();

  if (error) {
    console.error("❌ Erè saveConversation:", error);
    return null;
  }

  return data;
}

/**
 * Ranmase done yon itilizatè pa WhatsApp ID oswa telefòn
 * @param {string} phoneNumber - Nimewo WhatsApp itilizatè a
 */
export async function getUser(phoneNumber) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phoneNumber)
    .single();

  if (error) {
    console.error("❌ Erè getUser:", error);
    return null;
  }

  return data;
}

export default supabase;
