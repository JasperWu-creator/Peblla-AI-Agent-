const OpenAI = require("openai");

function serverLog(stage, details) {
  console.log(`[api/chat] ${stage}`, details || "");
}

function serverWarn(stage, details) {
  console.warn(`[api/chat] ${stage}`, details || "");
}

function extractJSON(text) {
  if (!text) return null;
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw);
}

function buildPlanFromText(answer, state) {
  const parsedAov = Number.parseFloat(String(state.averageOrderValue || "").replace(/[^0-9.]/g, "")) || 30;
  return {
    introSummary: answer || "Generated a strategy, but formatting was not in strict JSON.",
    promotions: [
      { tag: "LOYALTY", tagColor: "green", title: "Simple Repeat-Visit Program", desc: "Offer a punch-card style reward to increase retention among regulars.", value: "8×", valueLabel: "repeat trigger cycle" },
      { tag: "UPSELL", tagColor: "purple", title: "Premium Upgrade Prompt", desc: "Suggest one premium add-on for each order to lift basket size.", value: `+$${Math.round(parsedAov * 0.12)}`, valueLabel: "per order opportunity" },
      { tag: "SOCIAL", tagColor: "amber", title: "Instagram Check-In Offer", desc: "Give customers a low-cost freebie when they tag your restaurant online.", value: "3.2×", valueLabel: "organic reach ROI" }
    ],
    metrics: {
      avgOrderValue: `$${Math.round(parsedAov * 1.1)}`,
      avgOrderValueChange: "Estimated +10%",
      extraVisitsPerWeek: "15",
      extraVisitsPerWeekChange: "Estimated uplift",
      monthlyRevenueLift: "$2,500",
      monthlyRevenueLiftChange: "Modeled estimate",
      promoROI: "3.0×",
      promoROIChange: "Baseline projection"
    },
    channelImpact: [
      { name: "Loyalty", pct: 65, color: "#5de8c4" },
      { name: "Social media", pct: 58, color: "#b8a4f8" },
      { name: "In-store upsell", pct: 47, color: "#f5c26b" },
      { name: "Timed promotions", pct: 39, color: "#c8f56a" }
    ],
    cta: {
      title: "Ready to test these promotions?",
      subtitle: "Start with one offer this week, then compare visits, AOV, and repeat rate.",
      button: "Launch my plan →"
    },
    disclaimer: "This is a generated estimate; validate with your real data."
  };
}

async function pineconeSearch(userQuery, env) {
  if (!env.PINECONE_INDEX_HOST || !env.PINECONE_API_KEY) {
    serverWarn("pinecone.skipped.missing_config", {
      hostPresent: Boolean(env.PINECONE_INDEX_HOST),
      apiKeyPresent: Boolean(env.PINECONE_API_KEY),
      namespace: env.PINECONE_NAMESPACE
    });
    return { context: "No retrieved context; Pinecone is not fully configured.", hits: [] };
  }

  const namespace = env.PINECONE_NAMESPACE || "default";
  const pineconeUrl = `https://${env.PINECONE_INDEX_HOST}/records/namespaces/${namespace}/search`;
  serverLog("pinecone.request.start", { pineconeUrl, namespace });

  try {
    const response = await fetch(pineconeUrl, {
      method: "POST",
      headers: {
        "Api-Key": env.PINECONE_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Pinecone-Api-Version": "2025-10"
      },
      body: JSON.stringify({
        query: {
          inputs: { text: userQuery },
          top_k: 5
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      serverWarn("pinecone.request.non_200", {
        status: response.status,
        body: errText.slice(0, 500)
      });
      return { context: "No retrieved context; Pinecone request failed.", hits: [] };
    }

    const data = await response.json();
    const hits = data?.result?.hits || [];
    const context = hits.length
      ? hits
          .map((hit, i) => {
            const fields = hit.fields || {};
            return `[Doc ${i + 1}]
Source: ${fields.source || "unknown"}
Title: ${fields.title || ""}
Content: ${fields.chunk_text || ""}`;
          })
          .join("\n\n")
      : "No relevant documents were found in the knowledge base.";

    serverLog("pinecone.request.success", { hitCount: hits.length });
    return { context, hits };
  } catch (error) {
    serverWarn("pinecone.request.error", error?.message || String(error));
    return { context: "No retrieved context; Pinecone request errored.", hits: [] };
  }
}

module.exports = async function handler(req, res) {
  const env = {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_API_BASE_URL || process.env.BASE_URL || process.env.base_url,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || process.env.DEEPSEEK_CHAT_MODEL || "deepseek-chat",
    PINECONE_INDEX_HOST: process.env.PINECONE_INDEX_HOST || process.env.PINECONE_HOST,
    PINECONE_NAMESPACE: process.env.PINECONE_NAMESPACE || process.env.PINECONE_INDEX,
    PINECONE_API_KEY: process.env.PINECONE_API_KEY
  };

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed", debug: { expectedMethod: "POST" } });
  }

  if (!env.DEEPSEEK_API_KEY) {
    serverWarn("request.blocked.missing_deepseek_key");
    return res.status(500).json({
      error: "Missing DeepSeek API key on server.",
      debug: { expectedEnvVar: "DEEPSEEK_API_KEY", keyPresent: false }
    });
  }

  const deepseekBaseUrl = env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const client = new OpenAI({ baseURL: deepseekBaseUrl, apiKey: env.DEEPSEEK_API_KEY });

  try {
    const { question, restaurantType, businessGoal, averageOrderValue } = req.body || {};
    serverLog("request.received", {
      restaurantType,
      businessGoal,
      averageOrderValue,
      hasQuestion: Boolean(question)
    });

    const userQuery =
      question ||
      `Restaurant type: ${restaurantType || ""}. Goal: ${businessGoal || ""}. Average order value: ${averageOrderValue || ""}. Give relevant strategy advice.`;

    const { context, hits } = await pineconeSearch(userQuery, env);
    const messages = [
      {
        role: "system",
        content:
          "You are a restaurant AI agent. Reply with valid JSON only. Required keys: introSummary, promotions[3], metrics, channelImpact[4], cta, disclaimer."
      },
      {
        role: "user",
        content: `Return valid JSON for this request.
User request:\n${userQuery}\n\nRetrieved context:\n${context}\n\nJSON schema hints:
promotions[{tag,tagColor,title,desc,value,valueLabel}]
metrics{avgOrderValue,avgOrderValueChange,extraVisitsPerWeek,extraVisitsPerWeekChange,monthlyRevenueLift,monthlyRevenueLiftChange,promoROI,promoROIChange}
channelImpact[{name,pct,color}]
cta{title,subtitle,button}`
      }
    ];

    serverLog("deepseek.request.start", { model: env.DEEPSEEK_MODEL, deepseekBaseUrl, messageCount: messages.length });
    const completion = await client.chat.completions.create({
      model: env.DEEPSEEK_MODEL,
      messages,
      temperature: 0.3
    });
    serverLog("deepseek.request.success");

    const rawContent = completion.choices?.[0]?.message?.content || "";
    let plan;
    let parseWarning = null;

    try {
      plan = extractJSON(rawContent);
    } catch (parseError) {
      parseWarning = parseError?.message || "Unable to parse model JSON.";
      serverWarn("deepseek.response.parse_failed", parseWarning);
      plan = buildPlanFromText(rawContent, { averageOrderValue });
    }

    return res.status(200).json({
      ...plan,
      debug: {
        parseWarning,
        sourceCount: hits.length,
        model: env.DEEPSEEK_MODEL
      }
    });
  } catch (err) {
    const details = {
      message: err?.message || "Server error",
      status: err?.status,
      code: err?.code,
      type: err?.type
    };
    serverWarn("request.failed", details);
    return res.status(502).json({
      error: details.message,
      debug: {
        ...details,
        expectedEnvVars: [
          "DEEPSEEK_API_KEY",
          "DEEPSEEK_BASE_URL (optional)",
          "DEEPSEEK_MODEL (optional)",
          "PINECONE_INDEX_HOST",
          "PINECONE_NAMESPACE or PINECONE_INDEX",
          "PINECONE_API_KEY"
        ]
      }
    });
  }
};
