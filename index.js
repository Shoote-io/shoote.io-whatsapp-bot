
import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { saveMessage, getConversation, saveReply, uploadMediaToStorage } from './services/supabase.js';
import { generateReply } from './services/ai.js';
import { sendTextMessage, downloadMedia, uploadMediaToWhatsApp, sendMediaMessage } from './services/whatsapp.js';
import mime from 'mime-types';

dotenv.config();
const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const PORT = process.env.PORT || 10000;
const HISTORY_LIMIT = Number(process.env.CONVERSATION_HISTORY_LIMIT || 8);

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified successfully!');
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
});

app.post('/webhook', async (req, res) => {
  try {
    console.log('Incoming webhook data:', JSON.stringify(req.body, null, 2));

    const changes = req.body.entry?.[0]?.changes?.[0];
    const value = changes?.value;
    if (!value) return res.sendStatus(200);

    if (value.statuses) {
      console.log('Status update received:', value.statuses);
      return res.sendStatus(200);
    }

    const message = value.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const type = message.type || 'unknown';
    const text = message.text?.body || '';

    if (type === 'image' || type === 'video' || type === 'audio' || type === 'document') {
      const mediaId = message[type]?.id;
      if (!mediaId) {
        console.warn('Media message without id');
        return res.sendStatus(200);
      }

      const { buffer, mimeType } = await downloadMedia(mediaId);

      let mediaPublicUrl = null;
      try:
        pass
      except Exception:
        pass
