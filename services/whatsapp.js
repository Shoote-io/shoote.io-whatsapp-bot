
import axios from 'axios';
import FormData from 'form-data';

export async function downloadMedia(mediaId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const metaRes = await axios.get(`https://graph.facebook.com/v21.0/${mediaId}`, {
    params: { fields: 'mime_type,url' },
    headers: { Authorization: `Bearer ${token}` }
  });
  const { url, mime_type } = metaRes.data;
  const fileRes = await axios.get(url, { responseType: 'arraybuffer', headers: { Authorization: `Bearer ${token}` } });
  return { buffer: Buffer.from(fileRes.data), mimeType: mime_type || fileRes.headers['content-type'] || 'application/octet-stream' };
}

export async function uploadMediaToWhatsApp(phoneNumberId, buffer, filename, mimeType) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const form = new FormData();
  form.append('file', buffer, { filename, contentType: mimeType });
  form.append('messaging_product', 'whatsapp');
  const res = await axios.post(`https://graph.facebook.com/v21.0/${phoneNumberId}/media`, form, {
    headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
  return res.data;
}

export async function sendMediaMessage(phoneNumberId, to, mediaObjectId, type='image', caption) {
  const body = { messaging_product: 'whatsapp', to, type };
  body[type] = { id: mediaObjectId };
  if (caption && (type === 'image' || type === 'video' || type === 'document')) body[type].caption = caption;
  const res = await axios.post(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, body, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } });
  return res.data;
}

export async function sendTextMessage(phoneNumberId, to, text) {
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const payload = { messaging_product: 'whatsapp', to, text: { body: text } };
  const res = await axios.post(url, payload, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } });
  return res.data;
}
