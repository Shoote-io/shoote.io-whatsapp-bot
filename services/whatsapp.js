
import axios from "axios";
import FormData from "form-data";
import mime from "mime-types";

import { config } from "../config.js";

import {
  saveReply,
  saveMessage,
  uploadMediaToStorage,
  saveMediaLog
} from "./supabase.js";

// --------------------------------------------------
// 1. CONFIGURATION
// --------------------------------------------------

const GRAPH_BASE = "https://graph.facebook.com";

const MESSAGE_TTL_MS = 15 * 60 * 1000;
const MAX_TRACKED_MESSAGES = 10000;

const activeMessages = new Map();
const processedMessages = new Map();

// --------------------------------------------------
// 2. SHARED HELPERS
// --------------------------------------------------

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function assertWhatsApp() {
  if (!config.whatsappToken || !config.phoneNumberId) {
    throw new Error("WHATSAPP_CONFIGURATION_MISSING");
  }
}

function graphUrl(path) {
  const version = String(config.graphVersion || "v21.0")
    .replace(/^\/+|\/+$/g, "");

  return `${GRAPH_BASE}/${version}/${path}`;
}

function normalizeWhatsAppError(error) {
  const providerError = error.response?.data?.error;

  const normalized = new Error(
    providerError?.message ||
    error.message ||
    "WHATSAPP_REQUEST_FAILED"
  );

  normalized.code = providerError?.code || error.response?.status || null;
  normalized.status = error.response?.status || null;

  return normalized;
}

function cleanMessageMaps() {
  const now = Date.now();

  for (const [id, timestamp] of activeMessages) {
    if (now - timestamp > MESSAGE_TTL_MS) {
      activeMessages.delete(id);
    }
  }

  for (const [id, timestamp] of processedMessages) {
    if (now - timestamp > MESSAGE_TTL_MS) {
      processedMessages.delete(id);
    }
  }

  while (processedMessages.size > MAX_TRACKED_MESSAGES) {
    const oldest = processedMessages.keys().next().value;
    processedMessages.delete(oldest);
  }
}

// --------------------------------------------------
// 3. INCOMING MESSAGE DEDUPLICATION
// --------------------------------------------------

function beginMessage(id) {
  if (!id) return true;

  cleanMessageMaps();

  if (processedMessages.has(id) || activeMessages.has(id)) {
    return false;
  }

  activeMessages.set(id, Date.now());

  return true;
}

function completeMessage(id) {
  if (!id) return;

  activeMessages.delete(id);
  processedMessages.set(id, Date.now());

  cleanMessageMaps();
}

function failMessage(id) {
  if (!id) return;

  activeMessages.delete(id);
}

// --------------------------------------------------
// 4. INITIALIZATION
// --------------------------------------------------

export function initWhatsApp() {
  assertWhatsApp();

  console.log(
    `[WHATSAPP] transport ready: ${config.phoneNumberId}`
  );
}

// --------------------------------------------------
// 5. SEND TEXT MESSAGE
// --------------------------------------------------

export async function sendTextMessage(to, text) {
  assertWhatsApp();

  const recipient = normalizePhone(to);
  const message = String(text || "").trim();

  if (!recipient) {
    return {
      success: false,
      error: "RECIPIENT_MISSING"
    };
  }

  if (!message) {
    return {
      success: false,
      error: "EMPTY_MESSAGE"
    };
  }

  try {
    const response = await axios.post(
      graphUrl(`${config.phoneNumberId}/messages`),
      {
        messaging_product: "whatsapp",
        to: recipient,
        type: "text",
        text: {
          body: message
        }
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsappToken}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    const messageId = response.data?.messages?.[0]?.id;

    if (!messageId) {
      return {
        success: false,
        error: "WHATSAPP_MESSAGE_ID_MISSING"
      };
    }

    // Save the outgoing conversation record.
    // WhatsApp acceptance remains successful even if the
    // optional local conversation ledger fails.

    try {
      await saveReply({
        to_number: recipient,
        body: message,
        role: "assistant"
      });
    } catch (error) {
      console.error(
        "[WHATSAPP][REPLY_LEDGER_FAILED]",
        error.message
      );
    }

    return {
      success: true,
      message_id: messageId,
      status: "ACCEPTED",
      http_status: response.status
    };

  } catch (error) {
    const normalized = normalizeWhatsAppError(error);

    console.error("[WHATSAPP][TEXT_SEND_FAILED]", {
      message: normalized.message,
      code: normalized.code,
      status: normalized.status
    });

    return {
      success: false,
      error: normalized.message,
      code: normalized.code
    };
  }
}

// --------------------------------------------------
// 6. DOWNLOAD INCOMING MEDIA
// --------------------------------------------------

export async function downloadMedia(mediaId) {
  assertWhatsApp();

  if (!mediaId) {
    throw new Error("MEDIA_ID_REQUIRED");
  }

  try {
    const metadata = await axios.get(
      graphUrl(mediaId),
      {
        params: {
          fields: "mime_type,url"
        },
        headers: {
          Authorization: `Bearer ${config.whatsappToken}`
        },
        timeout: 20000
      }
    );

    const mediaUrl = metadata.data?.url;

    if (!mediaUrl) {
      throw new Error("MEDIA_DOWNLOAD_URL_MISSING");
    }

    const parsedUrl = new URL(mediaUrl);

    const allowedHost =
      parsedUrl.hostname === "graph.facebook.com" ||
      parsedUrl.hostname.endsWith(".fbsbx.com") ||
      parsedUrl.hostname.endsWith(".fbcdn.net");

    if (parsedUrl.protocol !== "https:" || !allowedHost) {
      throw new Error("MEDIA_DOWNLOAD_URL_NOT_ALLOWED");
    }

    const file = await axios.get(mediaUrl, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${config.whatsappToken}`
      },
      timeout: 30000,
      maxContentLength: 100 * 1024 * 1024
    });

    return {
      buffer: Buffer.from(file.data),
      mimeType:
        metadata.data?.mime_type ||
        file.headers["content-type"] ||
        "application/octet-stream"
    };

  } catch (error) {
    const normalized = normalizeWhatsAppError(error);

    console.error("[WHATSAPP][MEDIA_DOWNLOAD_FAILED]", {
      message: normalized.message,
      code: normalized.code
    });

    throw normalized;
  }
}

// --------------------------------------------------
// 7. UPLOAD MEDIA TO WHATSAPP
// --------------------------------------------------

export async function uploadMediaToWhatsApp(
  buffer,
  filename,
  mimeType
) {
  assertWhatsApp();

  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error("MEDIA_BUFFER_REQUIRED");
  }

  const safeFilename = String(filename || "media.bin");
  const safeMimeType =
    mimeType ||
    mime.lookup(safeFilename) ||
    "application/octet-stream";

  const form = new FormData();

  form.append("file", buffer, {
    filename: safeFilename,
    contentType: safeMimeType
  });

  form.append("messaging_product", "whatsapp");

  try {
    const response = await axios.post(
      graphUrl(`${config.phoneNumberId}/media`),
      form,
      {
        headers: {
          Authorization: `Bearer ${config.whatsappToken}`,
          ...form.getHeaders()
        },
        maxBodyLength: Infinity,
        timeout: 30000
      }
    );

    return response.data;

  } catch (error) {
    const normalized = normalizeWhatsAppError(error);

    console.error("[WHATSAPP][MEDIA_UPLOAD_FAILED]", {
      message: normalized.message,
      code: normalized.code
    });

    throw normalized;
  }
}

// --------------------------------------------------
// 8. SEND MEDIA MESSAGE
// --------------------------------------------------

export async function sendMediaMessage(
  to,
  mediaObjectId,
  type = "image",
  caption
) {
  assertWhatsApp();

  const recipient = normalizePhone(to);

  const supportedTypes = [
    "image",
    "video",
    "audio",
    "document"
  ];

  if (!recipient) {
    throw new Error("RECIPIENT_MISSING");
  }

  if (!mediaObjectId) {
    throw new Error("MEDIA_OBJECT_ID_REQUIRED");
  }

  if (!supportedTypes.includes(type)) {
    throw new Error("UNSUPPORTED_MEDIA_TYPE");
  }

  const mediaPayload = {
    id: mediaObjectId
  };

  if (
    caption &&
    ["image", "video", "document"].includes(type)
  ) {
    mediaPayload.caption = String(caption);
  }

  if (type === "document") {
    mediaPayload.filename = "document";
  }

  try {
    const response = await axios.post(
      graphUrl(`${config.phoneNumberId}/messages`),
      {
        messaging_product: "whatsapp",
        to: recipient,
        type,
        [type]: mediaPayload
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsappToken}`,
          "Content-Type": "application/json"
        },
        timeout: 20000
      }
    );

    return response.data;

  } catch (error) {
    const normalized = normalizeWhatsAppError(error);

    console.error("[WHATSAPP][MEDIA_SEND_FAILED]", {
      message: normalized.message,
      code: normalized.code
    });

    throw normalized;
  }
}

// --------------------------------------------------
// 9. INCOMING WEBHOOK PROCESSOR
// --------------------------------------------------

export async function handleIncomingWebhook(
  body,
  onText,
  onMedia
) {
  const results = {
    received: 0,
    processed: 0,
    duplicates: 0,
    failed: 0
  };

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;

      if (!value) continue;

      // Do not discard the entire webhook just because
      // it also contains WhatsApp delivery statuses.

      for (const message of value.messages || []) {
        results.received++;

        const messageId = message.id;

        if (!beginMessage(messageId)) {
          results.duplicates++;

          console.log(
            `[WHATSAPP] duplicate or active message ignored: ${messageId}`
          );

          continue;
        }

        try {
          const from = normalizePhone(message.from);
          const type = message.type || "unknown";

          if (!from) {
            throw new Error("INCOMING_SENDER_MISSING");
          }

          if (type === "text") {
            const text = String(
              message.text?.body || ""
            ).trim();

            if (!text) {
              throw new Error("INCOMING_TEXT_EMPTY");
            }

            await saveMessage({
              from_number: from,
              body: text,
              raw: message,
              message_id: messageId,
              dedup_key: messageId
            });

            if (typeof onText !== "function") {
              throw new Error("TEXT_HANDLER_MISSING");
            }

            await onText({
              from,
              text,
              message
            });

          } else if (
            ["image", "video", "audio", "document"].includes(type)
          ) {
            if (typeof onMedia !== "function") {
              throw new Error("MEDIA_HANDLER_MISSING");
            }

            await onMedia({
              from,
              type,
              message
            });

          } else {
            await saveMessage({
              from_number: from,
              body: null,
              media_mime: type,
              raw: message,
              message_id: messageId,
              dedup_key: messageId
            });

            if (typeof onMedia === "function") {
              await onMedia({
                from,
                type,
                message
              });
            }
          }

          completeMessage(messageId);
          results.processed++;

        } catch (error) {
          failMessage(messageId);
          results.failed++;

          console.error("[WHATSAPP][INCOMING_PROCESS_FAILED]", {
            message_id: messageId || null,
            message: error.message
          });

          // Allow the webhook route to report failure.
          // A retry can then attempt this message again.
          throw error;
        }
      }
    }
  }

  return results;
}

// --------------------------------------------------
// 10. INCOMING MEDIA PERSISTENCE
// --------------------------------------------------

export async function persistIncomingMedia({
  from,
  type,
  message
}) {
  assertWhatsApp();

  const sender = normalizePhone(from);
  const mediaId = message?.[type]?.id;

  if (!sender) {
    throw new Error("MEDIA_SENDER_REQUIRED");
  }

  if (!mediaId) {
    throw new Error(`MEDIA_ID_MISSING_FOR_${type}`);
  }

  const { buffer, mimeType } = await downloadMedia(mediaId);

  const extension = mime.extension(mimeType) || "bin";

  const filePath =
    `user_${sender}/${Date.now()}.${extension}`;

  const publicUrl = await uploadMediaToStorage(
    filePath,
    buffer,
    mimeType
  );

  await saveMediaLog({
    user_number: sender,
    file_path: filePath,
    mime_type: mimeType,
    public_url: publicUrl
  });

  await saveMessage({
    from_number: sender,
    body: null,
    media_url: publicUrl,
    media_mime: mimeType,
    raw: message,
    message_id: message.id,
    dedup_key: message.id
  });

  return {
    buffer,
    mimeType,
    publicUrl,
    mediaId
  };
}
