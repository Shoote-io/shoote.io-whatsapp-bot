// services/whatsapp.js
import axios from "axios";
import FormData from "form-data";
import { generateReply } from "./ai.js";
import { saveMessage, saveReply, uploadMediaToStorage } from "./supabase.js";
import mime from "mime-types";

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GRAPH_BASE = "https://graph.facebook.com";
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v17.0";

if (!WHATSAPP_TOKEN) console.warn("WHATSAPP_ACCESS_TOKEN not set in env");

export function initWhatsApp() {
  console.log("📲 WhatsApp service initialized");
}

// send text
export async function sendTextMessage(to, text) {
  try {
    const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
    const payload = { messaging_product: "whatsapp", to, type: "text", text: { body: text } };
    const res = await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
    });
    return res.data;
  } catch (err) {
    console.error("sendTextMessage error:", err.response?.data || err.message);
    return null;
  }
}

// send media by media object id
export async function sendMediaMessage(to, mediaObjectId, type = "image", caption) {
  try {
    const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
    const body = { messaging_product: "whatsapp", to, type };
    body[type] = { id: mediaObjectId };
    if (caption && (type === "image" || type === "video" || type === "document")) body[type].caption = caption;
    const res = await axios.post(url, body, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
    return res.data;
  } catch (err) {
    console.error("sendMediaMessage error:", err.response?.data || err.message);
    return null;
  }
}

// download media bytes via media id returned in webhook
export async function downloadMedia(mediaId) {
  try {
    // 1) get temporary url & mime
    const metaUrl = `${GRAPH_BASE}/${GRAPH_VERSION}/${mediaId}`;
    const meta = await axios.get(metaUrl, { params: { fields: "mime_type,url" }, headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
    const { url, mime_type } = meta.data;
    // 2) download bytes (must include auth)
    const fileRes = await axios.get(url, { responseType: "arraybuffer", headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
    return { buffer: Buffer.from(fileRes.data), mimeType: mime_type || fileRes.headers["content-type"] || "application/octet-stream" };
  } catch (err) {
    console.error("downloadMedia error:", err.response?.data || err.message);
    throw err;
  }
}

// upload to whatsapp to get media object id
export async function uploadMediaToWhatsApp(buffer, filename, mimeType) {
  try {
    const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/media`;
    const form = new FormData();
    form.append("file", buffer, { filename, contentType: mimeType });
    form.append("messaging_product", "whatsapp");
    const res = await axios.post(url, form, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, ...form.getHeaders() }, maxBodyLength: Infinity });
    return res.data; // contains id
  } catch (err) {
    console.error("uploadMediaToWhatsApp error:", err.response?.data || err.message);
    throw err;
  }
}

// main webhook processor
export async function handleIncomingWebhook(body) {
  try {
    if (!body?.entry) return;
    for (const entry of body.entry) {
      const change = entry.changes?.[0];
      const value = change?.value;
      if (!value) continue;

      // status updates
      if (value.statuses) {
        // optionally save statuses
        continue;
      }

      const message = value.messages?.[0];
      if (!message) continue;
      const from = message.from;
      const type = message.type || "unknown";

      // handle media messages
      if (["image", "video", "audio", "document"].includes(type)) {
        const mediaId = message[type]?.id;
        if (!mediaId) continue;
        const { buffer, mimeType } = await downloadMedia(mediaId);

        // store media in Supabase (optional)
        let publicUrl = null;
        try {
          const ext = mime.extension(mimeType) || "bin";
          const path = `user_${from}/${Date.now()}.${ext}`;
          publicUrl = await uploadMediaToStorage(path, buffer, mimeType);
        } catch (err) {
          console.warn("Supabase media upload failed:", err.message || err);
        }

        // re-upload to WhatsApp under your phone number
        const filename = `${mediaId}.${mime.extension(mimeType) || "bin"}`;
        const uploadRes = await uploadMediaToWhatsApp(buffer, filename, mimeType);
        const newMediaId = uploadRes?.id;

        // save incoming message
        await saveMessage(from, {
          role: "user",
          type,
          text: message.text?.body || null,
          media_url: publicUrl,
          media_mime: mimeType,
          whatsapp_media_id: newMediaId || null,
          raw: message
        });

        // echo media back
        if (newMediaId) {
          await sendMediaMessage(from, newMediaId, type, "Men kopi fichye w te voye a.");
        } else if (publicUrl) {
          await sendTextMessage(from, `Mwen sove fichye w la: ${publicUrl}`);
        }
        continue;
      }

      // handle text (normal flow)
      const text = message.text?.body || "";
      // save incoming message
      await saveMessage(from, { role: "user", type: "text", text, raw: message });

      // get reply from AI (uses history inside generateReply)
      const reply = await generateReply(from, text);
      if (reply) {
        // save reply and send
        await saveReply(from, { role: "bot", type: "text", text: reply });
        await sendTextMessage(from, reply);
      }
    }
  } catch (err) {
    console.error("handleIncomingWebhook error:", err);
  }
}
