
// services/whatsapp.js
import axios from "axios";
import FormData from "form-data";
import mime from "mime-types";
import { config } from "../config.js";
import { saveReply, saveMessage, uploadMediaToStorage, saveMediaLog } from "./supabase.js";

const GRAPH_BASE = "https://graph.facebook.com";
const seenMessageIds = new Map();
const SEEN_TTL_MS = 15 * 60 * 1000;

function rememberMessage(id) {
  if (!id) return false;
  const now = Date.now();
  for (const [key, timestamp] of seenMessageIds) {
    if (now - timestamp > SEEN_TTL_MS) seenMessageIds.delete(key);
  }
  if (seenMessageIds.has(id)) return true;
  seenMessageIds.set(id, now);
  return false;
}

function assertWhatsApp() {
  if (!config.whatsappToken || !config.phoneNumberId) {
    throw new Error("WhatsApp credentials are missing.");
  }
}

export function initWhatsApp() {
  assertWhatsApp();
  console.log(`[WHATSAPP] transport ready: ${config.phoneNumberId}`);
}

export async function sendTextMessage(to, text) {
  assertWhatsApp();
  if (!to) return { success: false, error: "RECIPIENT_MISSING" };
  if (!String(text || "").trim()) return { success: false, error: "EMPTY_MESSAGE" };

  try {
    const response = await axios.post(
      `${GRAPH_BASE}/${config.graphVersion}/${config.phoneNumberId}/messages`,
      { messaging_product: "whatsapp", to, type: "text", text: { body: String(text) } },
      { headers: { Authorization: `Bearer ${config.whatsappToken}`, "Content-Type": "application/json" }, timeout: 20000 }
    );

    const messageId = response.data?.messages?.[0]?.id;
    if (!messageId) return { success: false, error: "WHATSAPP_MESSAGE_ID_MISSING" };

    try {
      await saveReply({ to_number: to, body: String(text) });
    } catch (error) {
      console.error("[DB] reply ledger failed after WhatsApp acceptance:", error.message);
    }

    return { success: true, message_id: messageId, status: "ACCEPTED", http_status: response.status };
  } catch (error) {
    const data = error.response?.data;
    return {
      success: false,
      error: data?.error?.message || error.message || "WHATSAPP_SEND_ERROR",
      code: data?.error?.code || error.response?.status
    };
  }
}

export async function downloadMedia(mediaId) {
  assertWhatsApp();
  const meta = await axios.get(`${GRAPH_BASE}/${config.graphVersion}/${mediaId}`, {
    params: { fields: "mime_type,url" },
    headers: { Authorization: `Bearer ${config.whatsappToken}` },
    timeout: 20000
  });
  const file = await axios.get(meta.data.url, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${config.whatsappToken}` },
    timeout: 30000
  });
  return { buffer: Buffer.from(file.data), mimeType: meta.data.mime_type || file.headers["content-type"] || "application/octet-stream" };
}

export async function uploadMediaToWhatsApp(buffer, filename, mimeType) {
  assertWhatsApp();
  const form = new FormData();
  form.append("file", buffer, { filename, contentType: mimeType });
  form.append("messaging_product", "whatsapp");
  const response = await axios.post(`${GRAPH_BASE}/${config.graphVersion}/${config.phoneNumberId}/media`, form, {
    headers: { Authorization: `Bearer ${config.whatsappToken}`, ...form.getHeaders() },
    maxBodyLength: Infinity,
    timeout: 30000
  });
  return response.data;
}

export async function sendMediaMessage(to, mediaObjectId, type = "image", caption) {
  assertWhatsApp();
  const body = { messaging_product: "whatsapp", to, type, [type]: { id: mediaObjectId } };
  if (caption && ["image", "video", "document"].includes(type)) body[type].caption = caption;
  const response = await axios.post(`${GRAPH_BASE}/${config.graphVersion}/${config.phoneNumberId}/messages`, body, {
    headers: { Authorization: `Bearer ${config.whatsappToken}`, "Content-Type": "application/json" },
    timeout: 20000
  });
  return response.data;
}

export async function handleIncomingWebhook(body, onText, onMedia) {
  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      if (!value || value.statuses) continue;

      for (const message of value.messages || []) {
        if (rememberMessage(message.id)) {
          console.log(`[WHATSAPP] duplicate ignored: ${message.id}`);
          continue;
        }

        const from = message.from;
        const type = message.type || "unknown";

        if (type === "text") {
          const text = String(message.text?.body || "").trim();
          await saveMessage({
            from_number: from,
            body: text,
            raw: message,
            message_id: message.id,
            dedup_key: message.id
          });
          await onText({ from, text, message });
          continue;
        }

        if (["image", "video", "audio", "document"].includes(type)) {
          await onMedia({ from, type, message });
          continue;
        }

        await saveMessage({ from_number: from, body: null, media_mime: type, raw: message, message_id: message.id, dedup_key: message.id });
        await onMedia({ from, type, message });
      }
    }
  }
}

export async function persistIncomingMedia({ from, type, message }) {
  const mediaId = message?.[type]?.id;
  if (!mediaId) throw new Error(`Missing media id for ${type}.`);

  const { buffer, mimeType } = await downloadMedia(mediaId);
  const extension = mime.extension(mimeType) || "bin";
  const filePath = `user_${from}/${Date.now()}.${extension}`;
  const publicUrl = await uploadMediaToStorage(filePath, buffer, mimeType);
  await saveMediaLog({ user_number: from, file_path: filePath, mime_type: mimeType, public_url: publicUrl });
  await saveMessage({ from_number: from, body: null, media_url: publicUrl, media_mime: mimeType, raw: message, message_id: message.id, dedup_key: message.id });
  return { buffer, mimeType, publicUrl, mediaId };
}

