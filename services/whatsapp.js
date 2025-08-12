// services/whatsapp.js
export async function handleIncomingWebhook(body) {
  console.log("📩 Webhook resevwa payload:");
  console.log(JSON.stringify(body, null, 2));

import axios from "axios";
import FormData from "form-data";
import mime from "mime-types";
import { generateReply } from "./ai.js";
import { saveMessage, saveReply, uploadMediaToStorage } from "./supabase.js";

const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GRAPH = process.env.WHATSAPP_GRAPH_VERSION || "v17.0";
const GRAPH_BASE = "https://graph.facebook.com";

export function initWhatsApp() {
  if (!TOKEN || !PHONE_ID) {
    console.warn("WHATSAPP_ACCESS_TOKEN or PHONE_NUMBER_ID missing");
  } else {
    console.log("📲 WhatsApp service ready (phone id:", PHONE_ID, ")");
  }
}

// download media from WhatsApp media id
export async function downloadMedia(mediaId) {
  // get meta (url + mime)
  const metaRes = await axios.get(`${GRAPH_BASE}/${GRAPH}/${mediaId}`, {
    params: { fields: "mime_type,url" },
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  const { url, mime_type } = metaRes.data;
  const fileRes = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${TOKEN}` }
  });
  return { buffer: Buffer.from(fileRes.data), mimeType: mime_type || fileRes.headers["content-type"] || "application/octet-stream" };
}

export async function uploadMediaToWhatsApp(buffer, filename, mimeType) {
  const form = new FormData();
  form.append("file", buffer, { filename, contentType: mimeType });
  form.append("messaging_product", "whatsapp");
  const res = await axios.post(`${GRAPH_BASE}/${GRAPH}/${PHONE_ID}/media`, form, {
    headers: { Authorization: `Bearer ${TOKEN}`, ...form.getHeaders() },
    maxBodyLength: Infinity
  });
  return res.data; // { id: "..." }
}

export async function sendTextMessage(to, text) {
  try {
    const payload = { messaging_product: "whatsapp", to, text: { body: text } };
    const res = await axios.post(`${GRAPH_BASE}/${GRAPH}/${PHONE_ID}/messages`, payload, {
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }
    });
    return res.data;
  } catch (err) {
    console.error("sendTextMessage error:", err.response?.data || err.message);
    return null;
  }
}

export async function sendMediaMessage(to, mediaObjectId, type = "image", caption) {
  try {
    const body = { messaging_product: "whatsapp", to, type };
    body[type] = { id: mediaObjectId };
    if (caption && (type === "image" || type === "video" || type === "document")) body[type].caption = caption;
    const res = await axios.post(`${GRAPH_BASE}/${GRAPH}/${PHONE_ID}/messages`, body, {
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }
    });
    return res.data;
  } catch (err) {
    console.error("sendMediaMessage error:", err.response?.data || err.message);
    return null;
  }
}

/**
 * Main processor for the webhook body
 */
export async function handleIncomingWebhook(body) {
  try {
    if (!body?.entry) return;
    for (const entry of body.entry) {
      const change = entry.changes?.[0];
      const value = change?.value;
      if (!value) continue;

      // skip statuses
      if (value.statuses) continue;

      const message = value.messages?.[0];
      if (!message) continue;

      const from = message.from;
      const type = message.type || "text";

      // MEDIA
      if (["image", "video", "audio", "document"].includes(type)) {
        const mediaId = message[type]?.id;
        if (!mediaId) continue;

        const { buffer, mimeType } = await downloadMedia(mediaId);
        // upload to Supabase storage (optional)
        let publicUrl = null;
        try {
          const ext = mime.extension(mimeType) || "bin";
          const path = `user_${from}/${Date.now()}.${ext}`;
          publicUrl = await uploadMediaToStorage(path, buffer, mimeType);
        } catch (err) {
          console.warn("Supabase upload failed:", err?.message || err);
        }

        // upload back to WhatsApp (so you can send it by object id)
        let newMedia = null;
        try {
          const filename = `${mediaId}.${mime.extension(mimeType) || "bin"}`;
          newMedia = await uploadMediaToWhatsApp(buffer, filename, mimeType);
        } catch (err) {
          console.warn("Upload to WhatsApp failed:", err?.message || err);
        }

        // save incoming
        await saveMessage({
          from_number: from,
          body: message.text?.body || null,
          media_url: publicUrl,
          media_mime: mimeType,
          raw: JSON.stringify(message)
        });

        // echo back if possible
        if (newMedia?.id) {
          await sendMediaMessage(from, newMedia.id, type, "Men kopi fichye ou te voye a.");
        } else if (publicUrl) {
          await sendTextMessage(from, `Mwen sove fichye w la: ${publicUrl}`);
        }
        continue;
      }

      // TEXT
      const text = message.text?.body || "";
      await saveMessage({
        from_number: from,
        body: text,
        media_url: null,
        media_mime: null,
        raw: JSON.stringify(message)
      });

      const reply = await generateReply(from, text);
      if (reply) {
        await saveReply({ to_number: from, body: reply });
        await sendTextMessage(from, reply);
      }
    }
  } catch (err) {
    console.error("handleIncomingWebhook error:", err);
  }
}
