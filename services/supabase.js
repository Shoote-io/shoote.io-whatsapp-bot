import { createClient } from "@supabase/supabase-js";

// Konekte ak Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Ranmase yon konvèsasyon
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

// Sove oswa mete ajou konvèsasyon
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

// Ranmase done itilizatè
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
