// api/chat.js
const OpenAI = require("openai");

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question } = req.body;

    const pineconeRes = await fetch(
      `https://${process.env.PINECONE_INDEX_HOST}/records/namespaces/${process.env.PINECONE_NAMESPACE}/search`,
      {
        method: "POST",
        headers: {
          "Api-Key": process.env.PINECONE_API_KEY,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Pinecone-Api-Version": "2025-10"
        },
        body: JSON.stringify({
          query: {
            inputs: { text: question },
            top_k: 5
          }
        })
      }
    );

    if (!pineconeRes.ok) {
      throw new Error(`Pinecone search failed: ${pineconeRes.status} ${await pineconeRes.text()}`);
    }

    const pineconeData = await pineconeRes.json();
    const hits = pineconeData?.result?.hits || [];

    const context = hits
      .map((hit, i) => {
        const fields = hit.fields || {};
        return `[Doc ${i + 1}]
Source: ${fields.source || "unknown"}
Title: ${fields.title || ""}
Content: ${fields.chunk_text || ""}`;
      })
      .join("\n\n");

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "You are a restaurant AI agent. Answer only from the retrieved context when possible. If the context is insufficient, say so clearly."
        },
        {
          role: "user",
          content: `User question:\n${question}\n\nRetrieved context:\n${context}`
        }
      ],
      temperature: 0.3
    });

    return res.status(200).json({
      answer: completion.choices?.[0]?.message?.content || "",
      sources: hits.map(h => h.fields?.source).filter(Boolean)
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
};
