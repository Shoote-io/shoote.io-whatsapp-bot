// services/supabase.js (RESTORED & FIXED)

import { createClient } from "@supabase/supabase-js";

// 🔹 Env
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 🔹 Bucket
export const BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "ElmidorGroup";

// 🔹 Clients
export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// 🔹 Init
export function initSupabase() {
  console.log("🗄️ Supabase initialized");
  return supabaseAdmin;
}

export function checkSupabaseConfig() {
  if (!SUPABASE_URL) console.error("❌ Missing SUPABASE_URL variable");
  if (!SUPABASE_ANON_KEY) console.error("❌ Missing SUPABASE_ANON_KEY variable");
  if (!SUPABASE_SERVICE_ROLE_KEY) console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!BUCKET) console.warn("⚠ Using default bucket 'ElmidorGroup'");
}

// --------------------------------------------------
// MESSAGES
// --------------------------------------------------
export async function saveMessage(message) {
  if (!supabaseAdmin) return null;

  const payload = {
    from_number: message.from_number,
    body: message.body ?? null,
    media_url: message.media_url ?? null,
    media_mime: message.media_mime ?? null,
    raw: message.raw ?? {},
    role: message.role || "user"
  };

  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert([payload]);

  if (error) {
    console.error("saveMessage error:", error.message);
    return null;
  }

  return data;
}

// --------------------------------------------------
// REPLIES
// --------------------------------------------------
export async function saveReply(reply) {
  if (!supabaseAdmin) return null;

  const payload = {
    to_number: reply.to_number,
    body: reply.body,
    media_url: reply.media_url ?? null,
    role: reply.role || "assistant"
  };

  const { data, error } = await supabaseAdmin
    .from("replies")
    .insert([payload]);

  if (error) {
    console.error("saveReply error:", error);
    return null;
  }

  return data;
}

// --------------------------------------------------
// COMMANDS (NEW FEATURE)
// --------------------------------------------------
export async function createCommand({ type, status = "pending" }) {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("commands")
    .insert([
      {
        type,
        status
      }
    ]);

  if (error) {
    console.error("createCommand error:", error.message);
    return null;
  }

  return data;
}

export async function getCommandResult(commandId) {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("command_logs")
    .select("message")
    .eq("command_id", commandId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data?.message || null;
}

// --------------------------------------------------
// CONVERSATION HISTORY
// --------------------------------------------------
export async function getConversation(userNumber, limit = 8) {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("from_number, body, created_at, role")
    .eq("from_number", userNumber)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getConversation error:", error);
    return [];
  }

  return data ? data.reverse() : [];
}

// --------------------------------------------------
// STORAGE: UPLOAD MEDIA
// --------------------------------------------------
export async function uploadMediaToStorage(path, fileBuffer, contentType) {
  if (!supabaseAdmin) throw new Error("Supabase not initialized");

  console.log("📦 Uploading to:", path);

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, fileBuffer, {
      contentType,
      upsert: true
    });

  if (error) {
    console.error("uploadMediaToStorage error:", error.message);
    throw error;
  }

  const { data: urlData } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(path);

  const url = urlData?.publicUrl || null;

  console.log("✔ Storage URL =", url);

  return url;
}

// --------------------------------------------------
// MEDIA LOGGING
// --------------------------------------------------
export async function saveMediaLog(logEntry) {
  if (!supabaseAdmin) return null;

  const payload = {
    user_number: logEntry.user_number,
    file_path: logEntry.file_path,
    mime_type: logEntry.mime_type,
    public_url: logEntry.public_url
  };

  const { data, error } = await supabaseAdmin
    .from("media_logs")
    .insert([payload]);

  if (error) {
    console.error("saveMediaLog error:", error);
    return null;
  }

  return data;
}

// --------------------------------------------------
// PROCESS MEDIA (UPLOAD + LOG)
// --------------------------------------------------
export async function processMediaUpload(userNumber, fileName, buffer, mimeType) {
  try {
    const filePath = `${userNumber}/${fileName}`;

    const publicUrl = await uploadMediaToStorage(filePath, buffer, mimeType);

    if (!publicUrl) {
      console.error("processMediaUpload failed: no URL returned");
      return null;
    }

    const mediaRecord = {
      user_number: userNumber,
      file_path: filePath,
      mime_type: mimeType,
      public_url: publicUrl
    };

    await saveMediaLog(mediaRecord);

    return mediaRecord;
  } catch (err) {
    console.error("processMediaUpload error:", err.message);
    return null;
  }
}
