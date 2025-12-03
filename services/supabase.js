// services/supabase.js

import { createClient } from "@supabase/supabase-js";

// 🔹 Load environment variables properly
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 🔹 Bucket setup (with fallback)
export const BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "ElmidorGroup";

// 🔹 Client pou frontend / public access
export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// 🔹 Client pou backend admin (write access, bypass RLS)
export const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// 🔹 Initialize helper (optional)
export function initSupabase() {
  console.log("🗄️ Supabase initialized");
  return supabaseAdmin;
}

// 🔹 Helper pou verify envs ok
export function checkSupabaseConfig() {
  if (!SUPABASE_URL) console.error("❌ Missing SUPABASE_URL variable");
  if (!SUPABASE_ANON_KEY) console.error("❌ Missing SUPABASE_ANON_KEY variable");
  if (!SUPABASE_SERVICE_ROLE_KEY) console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY");
  if (!BUCKET) console.warn("⚠ Using default bucket 'ElmidorGroup'");
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

  console.log("📦 Uploading to:", path);

  // Step 1 — upload file
  const { data, error } = await supabase.storage
    .from("ElmidorGroup")
    .upload(path, fileBuffer, {
      contentType,
      upsert: true // allow overwrites
    });

  if (error) {
    console.error("uploadMediaToStorage error:", error.message);
    throw error;
  }

  // Step 2 — generate public URL
  const { data: urlData } = supabase.storage
    .from("ElmidorGroup")
    .getPublicUrl(path);

  const url = urlData?.publicUrl || null;

  console.log("✔ Storage URL =", url);

  return url;
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

