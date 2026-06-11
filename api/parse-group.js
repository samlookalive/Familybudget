export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `오늘 날짜는 ${today}이야.
아래 텍스트에서 묶음 지출 내역을 파싱해줘.
카테고리: 식비, 교통, 쇼핑, 의료/건강, 생활/마트, 문화/여가, 여행, 월세/관리비, 구독서비스, 통신비, 교육, 보험, 기타

JSON만 반환해. 다른 텍스트 없이.
형식: {"group_name":"묶음명","category":"대표카테고리","date":"YYYY-MM-DD","children":[{"memo":"항목명","amount":숫자,"category":"카테고리"}]}

텍스트: ${text}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://familybudget-ochre.vercel.app",
      },
      body: JSON.stringify({
        model: "google/gemma-3-12b-it:free",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 1024,
      }),
    });

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "{}";
    const clean = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = {};
    }

    return res.status(200).json({ group: parsed });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
