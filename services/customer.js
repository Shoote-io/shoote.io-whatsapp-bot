
import { findClientByPhone } from "./supabase.js";

// --------------------------------------------------
// CUSTOMER RESOLUTION
// --------------------------------------------------

function firstValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return String(value).trim();
    }
  }

  return null;
}

function normalizeContactType(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) return "client";

  const prospects = ["prospect", "lead", "potential", "potential_client"];
  if (prospects.includes(normalized)) return "prospect";

  return normalized;
}

function buildClientProfile(client, type) {
  const name = firstValue(client, [
    "name",
    "full_name",
    "display_name",
    "first_name"
  ]);

  const organization = firstValue(client, [
    "organization",
    "company",
    "company_name"
  ]);

  const details = [
    name ? `Non: ${name}` : null,
    organization ? `Òganizasyon: ${organization}` : null,
    `Kalite kontak: ${type}`
  ].filter(Boolean);

  return `Kontak la egziste nan tab clients. ${details.join("; ")}.`;
}

// --------------------------------------------------
// PUBLIC RESOLVER
// --------------------------------------------------

export async function resolveCustomer(phone) {
  if (!phone || !String(phone).trim()) {
    throw new Error("CUSTOMER_PHONE_REQUIRED");
  }

  const client = await findClientByPhone(phone);

  if (!client) {
    return {
      exists: false,
      type: "prospect",
      client: null,
      profile:
        "Kontak la pa egziste nan tab clients. Trete li kòm yon nouvo kontak oswa potansyèl kliyan."
    };
  }

  const type = normalizeContactType(
    firstValue(client, [
      "client_type",
      "customer_type",
      "type",
      "role",
      "status"
    ])
  );

  return {
    exists: true,
    type,
    client,
    profile: buildClientProfile(client, type)
  };
}
