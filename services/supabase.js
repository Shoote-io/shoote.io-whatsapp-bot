// services/supabase.js
import { createClient } from '@supabase/supabase-js';

// ✅ Kreye koneksyon ak Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("❌ SUPABASE_URL oswa SUPABASE_KEY manke nan anviwònman an!");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * ✅ Sove mesaj ki soti nan itilizatè
 * @param {Object} message - { from, body, timestamp, mediaUrl? }
 */
export async function saveMessage(message) {
  const { data, error } = await supabase
    .from('messages')
    .insert([message]);

  if (error) {
    console.error("❌ Erè nan saveMessage:", error);
    throw error;
  }
  return data;
}

/**
 * ✅ Sove repons bot la
 * @param {Object} reply - { to, body, timestamp, mediaUrl? }
 */
export async function saveReply(reply) {
  const { data, error } = await supabase
    .from('replies')
    .insert([reply]);

  if (error) {
    console.error("❌ Erè nan saveReply:", error);
    throw error;
  }
  return data;
}

/**
 * ✅ Sove yon konvèsasyon antye
 * @param {Object} conversation - { user_id, messages, started_at, ended_at? }
 */
export async function saveConversation(conversation) {
  const { data, error } = await supabase
    .from('conversations')
    .insert([conversation]);

  if (error) {
    console.error("❌ Erè nan saveConversation:", error);
    throw error;
  }
  return data;
}

/**
 * ✅ Telechaje fichye medya nan Supabase Storage
 * @param {String} filePath - chemen nan bucket la (ex: "user123/photo.jpg")
 * @param {File|Buffer} file - fichye a (Buffer pou Node.js)
 */
export async function uploadMediaToStorage(filePath, file) {
  const { data, error } = await supabase.storage
    .from('media')
    .upload(filePath, file, { upsert: true });

  if (error) {
    console.error("❌ Erè nan uploadMediaToStorage:", error);
    throw error;
  }
  return data;
}

/**
 * ✅ Ranmase medya soti nan Supabase Storage
 * @param {String} filePath - chemen fichye a nan bucket la
 */
export function getMediaPublicUrl(filePath) {
  const { data } = supabase.storage
    .from('media')
    .getPublicUrl(filePath);

  return data?.publicUrl || null;
}
