export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `오늘 날짜는 ${today}이야.
아래 텍스트에서 가계부 거래 내역을 파싱해줘.

규칙:
- 월급, 급여, 수입, 들어왔 → type: "income"
- 나머지 → type: "expense"
- 만원 = 10000원, 천원 = 1000원
- 날짜가 없으면 오늘 날짜 사용

카테고리: 식비, 교통, 쇼핑, 의료/건강, 생활/마트, 문화/여가, 여행, 월세/관리비, 구독서비스, 통신비, 교육, 보험, 월급, 부수입, 용돈, 기타수입, 기타

반드시 JSON 배열만 반환. 설명 없이.
형식: [{"date":"YYYY-MM-DD","amount":숫자,"memo":"메모","type":"income 또는 expense","category":"카테고리"}]

예시:
입력: "6월 월급 300만원 들어왔어"
출력: [{"date":"${today}","amount":3000000,"memo":"월급","type":"income","category":"월급"}]

입력: "스타벅스 6500원"
출력: [{"date":"${today}","amount":6500,"memo":"스타벅스","type":"expense","category":"식비"}]

텍스트: ${text}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 1024 },
        }),
      }
    );

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    const clean = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      // JSON 파싱 실패 시 빈 배열
      parsed = [];
    }

    return res.status(200).json({ transactions: Array.isArray(parsed) ? parsed : [parsed] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
