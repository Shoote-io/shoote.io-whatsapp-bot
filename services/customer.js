import { findClientByPhone } from "./supabase.js";

function firstValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

export async function resolveCustomer(phone) {
  const client = await findClientByPhone(phone);
  if (!client) {
    return {
      exists: false,
      type: "prospect",
      client: null,
      profile: "Moun nan pa parèt nan tab clients la. Konsidere li kòm yon nouvo kontak/potansyèl kliyan."
    };
  }

  const type = String(
    firstValue(client, ["client_type", "customer_type", "type", "role", "status"]) || "client"
  ).toLowerCase();

  const name = firstValue(client, ["name", "full_name", "display_name", "first_name"]);
  const company = firstValue(client, ["company", "company_name", "organization"]);
  const profileBits = [
    name ? `non: ${name}` : null,
    company ? `konpayi: ${company}` : null,
    `kalite kontak: ${type}`
  ].filter(Boolean);

  return {
    exists: true,
    type,
    client,
    profile: `Kontak la egziste nan clients. ${profileBits.join("; ")}.`
  };
}
