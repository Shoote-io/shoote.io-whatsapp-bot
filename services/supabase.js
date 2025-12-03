// services/supabase.js
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const BUCKET = "ElmidorGroup";

let supabase = null;

export async function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("Supabase not configured (SUPABASE_URL or SUPABASE_KEY missing).");
    return;
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log("🗄️ Supabase initialized");
}

/**
 * Save incoming message record
 * message = { from_number, body, media_url, media_mime, raw }
 */
export async function saveMessage(message) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("messages")
    .insert([message]);

  if (error) {
    console.error("saveMessage error:", error);
    return null;
  }

  return data;
}

/**
 * Save bot reply record
 * reply = { to_number, body, media_url }
 */
export async function saveReply(reply) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("replies")
    .insert([reply]);

  if (error) {
    console.error("saveReply error:", error);
    return null;
  }

  return data;
}

/**
 * Get last N messages for a user (by from_number)
 * returns array oldest->newest
 */
export async function getConversation(userNumber, limit = 8) {
  if (!supabase) return [];

  const { data, error } = await supabase
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

/**
 * Upload media buffer to Supabase storage bucket and return public URL
 */
export async function uploadMediaToStorage(path, fileBuffer, contentType) {
  if (!supabase) throw new Error("Supabase not initialized");

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, fileBuffer, {
      contentType,
      upsert: false
    });

  if (error) {
    console.error("uploadMediaToStorage error:", error);
    throw error;
  }

  const { data: publicUrlData, error: urlErr } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path);

  if (urlErr) {
    console.error("getPublicUrl error:", urlErr);
    throw urlErr;
  }

  return publicUrlData?.publicUrl || null;
}

/**
 * Save media upload to media_logs table
 * logEntry = { user_number, file_path, mime_type, public_url }
 */
export async function saveMediaLog(logEntry) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("media_logs")
    .insert([logEntry]);

  if (error) {
    console.error("saveMediaLog error:", error);
    return null;
  }

  return data;
}

/**
 * Upload file + write record to media_logs
 */
export async function processMediaUpload(userNumber, fileName, buffer, mimeType) {
  try {
    const filePath = `${BUCKET}/${userNumber}/${fileName}`;

    // Upload file
    const publicUrl = await uploadMediaToStorage(filePath, buffer, mimeType);

    if (!publicUrl) {
      console.error("processMediaUpload failed: no URL returned");
      return null;
    }

    // Log into DB
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

