import fetch from "node-fetch";

// Lis repons offline si API a pa disponib
const offlineReplies = [
  "Mwen la pou ede w, men kounya m pa ka jwenn repons otomatik yo.",
  "Hmm... Mwen pa ka jwenn done yo kounya, men n ap retounen sou sa pita.",
  "Pa gen pwoblèm, n ap kontinye lè koneksyon re vini.",
  "Mwen poko ka reponn sa kounya, men m la toujou.",
  "Gen yon ti pwoblèm teknik kounya, eseye voye mesaj la ankò pita."
];

function getRandomOfflineReply() {
  return offlineReplies[Math.floor(Math.random() * offlineReplies.length)];
}

export async function generateReply(messageText) {
  const apiKey = process.env.GROQ_API_KEY;
  const groqUrl = process.env.GROQ_API_URL || "https://api.groq.com"; // Fallback URL default

  try {
    const response = await fetch(`${groqUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [
          { role: "system", content: "Ou se yon asistan WhatsApp zanmitay." },
          { role: "user", content: messageText }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || getRandomOfflineReply();
  } catch (err) {
    console.error("generateReply error:", err.message);
    return getRandomOfflineReply();
  }
}
