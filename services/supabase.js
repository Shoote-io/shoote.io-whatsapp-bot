
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_MEDIA_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'media';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function uploadMediaToStorage(path, buffer, mimeType) {
  const { data, error } = await supabase.storage.from(SUPABASE_MEDIA_BUCKET).upload(path, buffer, { contentType: mimeType });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(SUPABASE_MEDIA_BUCKET).getPublicUrl(path);
  return urlData?.publicUrl || null;
}

export async function saveMessage(userId, message) {
  const row = {
    user_id: userId,
    role: message.role,
    type: message.type,
    content: message.text || null,
    media_url: message.media_url || null,
    media_mime: message.media_mime || null,
    whatsapp_media_id: message.whatsapp_media_id || null,
    raw: message.raw ? JSON.stringify(message.raw) : null
  };
  const { data, error } = await supabase.from('messages').insert([row]);
  if (error) throw error;
  return data;
}

export async function getConversation(userId, limit = 8) {
  const { data, error } = await supabase.from('messages').select('role, type, content, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data ? data.reverse() : [];
}

export async function saveReply(userId, message) {
  return saveMessage(userId, message);
}
