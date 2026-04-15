const OpenAI = require('openai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing DEEPSEEK_API_KEY in Vercel environment variables.' });
  }

  try {
    const { restaurantType = '', businessGoal = '', averageOrderValue = '' } = req.body || {};

    if (!restaurantType || !businessGoal || !averageOrderValue) {
      return res.status(400).json({
        error: 'restaurantType, businessGoal, and averageOrderValue are required.'
      });
    }

    const client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey
    });

    const systemPrompt = `You are a restaurant growth strategist. Reply with valid JSON only.
Return exactly this schema:
{
  "introSummary": string,
  "promotions": [
    {"tag": string, "tagColor": "green"|"purple"|"amber", "title": string, "desc": string, "value": string, "valueLabel": string},
    {"tag": string, "tagColor": "green"|"purple"|"amber", "title": string, "desc": string, "value": string, "valueLabel": string},
    {"tag": string, "tagColor": "green"|"purple"|"amber", "title": string, "desc": string, "value": string, "valueLabel": string}
  ],
  "metrics": {
    "avgOrderValue": string,
    "avgOrderValueChange": string,
    "extraVisitsPerWeek": string,
    "extraVisitsPerWeekChange": string,
    "monthlyRevenueLift": string,
    "monthlyRevenueLiftChange": string,
    "promoROI": string,
    "promoROIChange": string
  },
  "channelImpact": [
    {"name": string, "pct": number, "color": string},
    {"name": string, "pct": number, "color": string},
    {"name": string, "pct": number, "color": string},
    {"name": string, "pct": number, "color": string}
  ],
  "cta": {"title": string, "subtitle": string, "button": string},
  "disclaimer": string
}
Rules:
- Keep it concise and commercial.
- Use realistic but directional estimates, not guaranteed claims.
- Keep promotions actionable for a single-location restaurant.
- Percentages in channelImpact should be integers between 25 and 85.
- Use these exact tagColor values only: green, purple, amber.
- Use hex colors for channelImpact color values.
- Use US dollar formatting when relevant.
- Do not include markdown fences.`;

    const userPrompt = `Restaurant type: ${restaurantType}\nBusiness goal: ${businessGoal}\nAverage order value: ${averageOrderValue}\nGenerate a 30-day growth plan.`;

    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      temperature: 0.6,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });

    const content = completion?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({
        error: 'DeepSeek returned an empty response.',
        details: completion
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      return res.status(502).json({
        error: 'DeepSeek returned non-JSON output.',
        raw: content
      });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    const status = error?.status || error?.response?.status || 500;
    return res.status(status).json({
      error: error?.message || 'Unexpected server error.',
      details: error?.response?.data || null
    });
  }
};
