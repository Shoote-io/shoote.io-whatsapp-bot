import {
  getPendingDeliveryEvents,
  claimDeliveryEvent,
  markDeliverySent,
  releaseDeliveryEvent,
  findClientByMachineId
} from "./supabase.js";
import { sendTextMessage } from "./whatsapp.js";
import { config } from "../config.js";

let timer = null;
let running = false;
let stopped = false;

async function resolveRecipient(event) {
  // Prefer the event's own routing data when the schema provides it.
  const direct = event?.phone_number || event?.recipient_number || event?.to_number;
  if (direct) return direct;

  // Fall back to the machine -> client relationship used by the existing runtime.
  if (event?.machine_id) {
    const client = await findClientByMachineId(event.machine_id);
    return client?.phone_number || null;
  }

  return null;
}

async function deliver(event) {
  const id = event?.id;
  if (!id) return;

  const claimed = await claimDeliveryEvent(id);
  if (!claimed) return;

  const recipient = await resolveRecipient(event);
  const message = String(event?.message_text || "").trim();

  if (!recipient || !message) {
    console.error(`[DELIVERY] ${id}: missing recipient or message; releasing.`);
    await releaseDeliveryEvent(id);
    return;
  }

  try {
    console.log(`[DELIVERY] sending event=${id} message=${event.message_id || "n/a"}`);
    const result = await sendTextMessage(recipient, message);

    if (!result?.success) {
      console.error(`[DELIVERY] send failed event=${id}: ${result?.error || "unknown"}`);
      await releaseDeliveryEvent(id);
      return;
    }

    const confirmed = await markDeliverySent(id, result.message_id);
    if (!confirmed) {
      console.error(`[DELIVERY] WhatsApp accepted event=${id}, but DB state was not confirmed. No automatic resend.`);
      return;
    }

    console.log(`[DELIVERY] sent event=${id} whatsapp=${result.message_id}`);
  } catch (error) {
    console.error(`[DELIVERY] exception event=${id}:`, error.message);
    try { await releaseDeliveryEvent(id); } catch (releaseError) {
      console.error(`[DELIVERY] release failed event=${id}:`, releaseError.message);
    }
  }
}

export async function runDeliveryCycle() {
  if (running || stopped) return;
  running = true;
  try {
    const events = await getPendingDeliveryEvents(config.deliveryBatchSize);
    if (events.length) console.log(`[DELIVERY] discovered ${events.length} pending event(s).`);
    for (const event of events) await deliver(event);
  } catch (error) {
    console.error("[DELIVERY] discovery cycle failed:", error.message);
  } finally {
    running = false;
  }
}

export function startResponseDeliveryWorker() {
  if (timer || stopped) return;
  console.log(`[DELIVERY] worker online; poll=${config.deliveryPollMs}ms batch=${config.deliveryBatchSize}`);

  const tick = async () => {
    await runDeliveryCycle();
    if (!stopped) timer = setTimeout(tick, config.deliveryPollMs);
  };

  timer = setTimeout(tick, 0);
}

export function stopResponseDeliveryWorker() {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
}
