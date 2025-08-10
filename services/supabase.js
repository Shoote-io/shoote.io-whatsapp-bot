// services/supabase.js
import { createClient } from "@supabase/supabase-js";

// Antre kle Supabase ou yo nan env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment variables");
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Sove yon mesaj orijinal itilizatè a
 */
export async function saveMessage(conversationId, sender, content) {
  const { data, error } = await supabase
    .from("messages")
    .insert([{ conversation_id: conversationId, sender, content }]);

  if (error) {
    console.error("Error saving message:", error);
    throw error;
  }
  return data;
}

/**
 * Sove yon repons bot la
 */
export async function saveReply(conversationId, reply) {
  const { data, error } = await supabase
    .from("replies")
    .insert([{ conversation_id: conversationId, reply }]);

  if (error) {
    console.error("Error saving reply:", error);
    throw error;
  }
  return data;
}

/**
 * Rekipere konvèsasyon dapre ID
 */
export async function getConversation(conversationId) {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (error) {
    console.error("Error fetching conversation:", error);
    throw error;
  }
  return data;
}

/**
 * Upload fichye medya nan Supabase Storage
 */
export async function uploadMediaToStorage(bucketName, filePath, fileContent, contentType) {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, fileContent, {
      contentType,
      upsert: true
    });

  if (error) {
    console.error("Error uploading media:", error);
    throw error;
  }
  return data;
}
