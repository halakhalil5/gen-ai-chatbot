const fs = require("fs");
const path = require("path");

const MEMORY_FILE = path.join(__dirname, "memory.json");

function loadMemory(userId) {
  if (!fs.existsSync(MEMORY_FILE)) return "";
  const data = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
  return data[userId] || "";
}

function saveMemory(userId, note) {
  let data = {};
  if (fs.existsSync(MEMORY_FILE)) {
    data = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
  }
  data[userId] = note;
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
}

async function compressMemory(messages, apiKey) {
  const history = messages.map((m) => `${m.role}: ${m.content}`).join("\n");

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openrouter/auto",
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
                "You are a memory compression system. Extract a compact memory note from this conversation. Focus only on persistent facts, preferences, goals, and stable context. Use 3 to 6 short bullet points. Do not include temporary chat details. Output only the note.",
          },
          { role: "user", content: history },
        ],
      }),
    },
  );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Memory compression request failed.");
    }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

module.exports = { loadMemory, saveMemory, compressMemory };
