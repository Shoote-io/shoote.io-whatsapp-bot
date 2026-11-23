
import {
  getPendingDeliveryEvents,
  claimDeliveryEvent,
  markDeliverySent,
  markDeliveryFailure,
  releaseDeliveryEvent,
  findClientByMachineId
} from "./supabase.js";

import { sendTextMessage } from "./whatsapp.js";
import { config } from "../config.js";

// --------------------------------------------------
// 1. WORKER STATE
// --------------------------------------------------

let timer = null;
let running = false;
let stopped = true;

// --------------------------------------------------
// 2. RECIPIENT RESOLUTION
// --------------------------------------------------

async function resolveRecipient(event) {
  const direct =
    event?.phone_number ||
    event?.recipient_number ||
    event?.to_number;

  if (direct && String(direct).trim()) {
    return String(direct).trim();
  }

  if (!event?.machine_id) {
    return null;
  }

  const client = await findClientByMachineId(event.machine_id);

  return client?.phone_number
    ? String(client.phone_number).trim()
    : null;
}

// --------------------------------------------------
// 3. EVENT FAILURE HANDLING
// --------------------------------------------------

async function failEvent(eventId, reason) {
  try {
    const marked = await markDeliveryFailure(eventId, reason);

    if (!marked) {
      console.error(
        `[DELIVERY] event=${eventId}: failure state was not confirmed.`
      );
    }

    return marked;
  } catch (error) {
    console.error(
      `[DELIVERY] event=${eventId}: unable to record failure:`,
      error.message
    );

    return false;
  }
}

// --------------------------------------------------
// 4. SINGLE EVENT DELIVERY
// --------------------------------------------------

async function deliver(event) {
  const id = event?.id;

  if (!id) {
    console.error("[DELIVERY] event without an ID ignored.");
    return;
  }

  let claimed = false;
  let sendAttempted = false;

  try {
    // A. Atomic ownership claim.
    claimed = await claimDeliveryEvent(id);

    if (!claimed) return;

    // B. Validate event content.
    const message = String(event?.message_text || "").trim();

    if (!message) {
      await failEvent(id, "INVALID_EVENT: MESSAGE_TEXT_MISSING");
      return;
    }

    // C. Resolve recipient before contacting WhatsApp.
    const recipient = await resolveRecipient(event);

    if (!recipient) {
      await failEvent(id, "INVALID_EVENT: RECIPIENT_NOT_FOUND");
      return;
    }

    // D. Send message.
    console.log(
      `[DELIVERY] sending event=${id} message=${event.message_id || "n/a"}`
    );

    sendAttempted = true;

    const result = await sendTextMessage(recipient, message);

    if (!result?.success || !result?.message_id) {
      const reason =
        `DELIVERY_OUTCOME_UNCERTAIN: ${
          result?.error || "WHATSAPP_ACCEPTANCE_NOT_CONFIRMED"
        }; code=${result?.code || "unknown"}`;

      console.error(`[DELIVERY] event=${id}: ${reason}`);

      // Do not automatically release an event after a send attempt.
      // A timeout or lost response does not prove WhatsApp rejected it.
      await failEvent(id, reason);

      return;
    }

    // E. Confirm delivery acceptance in Supabase.
    const confirmed = await markDeliverySent(
      id,
      result.message_id
    );

    if (!confirmed) {
      const reason =
        `DELIVERY_OUTCOME_UNCERTAIN: WHATSAPP_ACCEPTED; ` +
        `WHATSAPP_MESSAGE_ID=${result.message_id}; ` +
        `DATABASE_CONFIRMATION_NOT_CONFIRMED`;

      console.error(`[DELIVERY] event=${id}: ${reason}`);

      await failEvent(id, reason);

      return;
    }

    console.log(
      `[DELIVERY] sent event=${id} whatsapp=${result.message_id}`
    );

  } catch (error) {
    console.error(
      `[DELIVERY] event=${id} exception:`,
      error.message
    );

    if (!claimed) return;

    if (sendAttempted) {
      // External delivery may already have happened.
      // Do not return this event to the automatic queue.
      await failEvent(
        id,
        `DELIVERY_OUTCOME_UNCERTAIN: ${error.message}`
      );

      return;
    }

    // Before WhatsApp was contacted, retrying is safe.
    try {
      await releaseDeliveryEvent(id);

      console.log(
        `[DELIVERY] event=${id} released for retry.`
      );
    } catch (releaseError) {
      console.error(
        `[DELIVERY] event=${id} release failed:`,
        releaseError.message
      );
    }
  }
}

// --------------------------------------------------
// 5. DELIVERY CYCLE
// --------------------------------------------------

export async function runDeliveryCycle() {
  if (running || stopped) return;

  running = true;

  const stats = {
    discovered: 0,
    processed: 0
  };

  try {
    const events = await getPendingDeliveryEvents(
      config.deliveryBatchSize
    );

    stats.discovered = events.length;

    if (events.length) {
      console.log(
        `[DELIVERY] discovered ${events.length} pending event(s).`
      );
    }

    for (const event of events) {
      if (stopped) break;

      await deliver(event);
      stats.processed++;
    }

  } catch (error) {
    console.error(
      "[DELIVERY] discovery cycle failed:",
      error.message
    );

  } finally {
    running = false;
  }

  return stats;
}

// --------------------------------------------------
// 6. WORKER START
// --------------------------------------------------

export function startResponseDeliveryWorker() {
  if (timer || running) return;

  stopped = false;

  console.log(
    `[DELIVERY] worker online; poll=${config.deliveryPollMs}ms batch=${config.deliveryBatchSize}`
  );

  const tick = async () => {
    timer = null;

    if (stopped) return;

    await runDeliveryCycle();

    if (!stopped) {
      timer = setTimeout(tick, config.deliveryPollMs);
    }
  };

  timer = setTimeout(tick, 0);
}

// --------------------------------------------------
// 7. WORKER STOP
// --------------------------------------------------

export function stopResponseDeliveryWorker() {
  stopped = true;

  if (timer) {
    clearTimeout(timer);
  }

  timer = null;

  console.log("[DELIVERY] worker stopped.");
}
