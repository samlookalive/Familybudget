export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, categories, ai_rules } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now()-86400000).toISOString().slice(0, 10);

  // 요일별 날짜 계산
  const todayDate = new Date();
  const dow = todayDate.getDay(); // 0=일,1=월,...,6=토
  const getDate = (diff) => {
    const d = new Date(todayDate);
    d.setDate(todayDate.getDate() + diff);
    return d.toISOString().slice(0,10);
  };
  const days = ['일','월','화','수','목','금','토'];
  const thisWeek = days.map((n,d) => `이번주${n}요일=${getDate(d-dow)}`).join(', ');
  const lastWeek = days.map((n,d) => `지난주${n}요일=${getDate(d-dow-7)}`).join(', ');

  // 카테고리 목록 (동적 or 기본값)
  const categoryList = categories?.length
    ? categories.join(", ")
    : "식비, 교통, 쇼핑, 의료/건강, 생활/마트, 문화/여가, 여행, 월세/관리비, 구독서비스, 통신비, 교육, 보험, 월급, 부수입, 용돈, 기타수입, 기타";

  // AI 규칙 (동적)
  const rulesText = ai_rules?.length
    ? `\n커스텀 규칙 (반드시 우선 적용):\n${ai_rules.map(r => `- "${r.keyword}" → category: "${r.category}"${r.type ? `, type: "${r.type}"` : ""}`).join("\n")}\n`
    : "";

  const prompt = `오늘 날짜는 ${today}이야.
아래 텍스트에서 가계부 거래 내역을 파싱해줘.
${rulesText}
규칙:
- 월급, 급여, 수입, 들어왔, 입금 → type: "income"
- 나머지 → type: "expense"
- 만원 = 10000원, 천원 = 1000원
- 어제 = ${yesterday}, 날짜 없으면 오늘(${today})
- 이번주 요일: ${thisWeek}
- 지난주 요일: ${lastWeek}
- "지난 토요일", "저번 토요일" 등도 지난주 토요일로 처리
- memo는 "가맹점/품목" 형식 (예: "스타벅스/아메리카노", 품목 없으면 "스타벅스")

카테고리: ${categoryList}

반드시 JSON 배열만 반환. 설명 없이.
형식: [{"date":"YYYY-MM-DD","amount":숫자,"memo":"가맹점/품목","type":"income 또는 expense","category":"카테고리"}]

예시:
입력: "어제 다이소에서 5000원 샀어"
출력: [{"date":"${yesterday}","amount":5000,"memo":"다이소","type":"expense","category":"쇼핑"}]

입력: "GS25에서 담배 샀어"
출력: [{"date":"${today}","amount":0,"memo":"GS25/담배","type":"expense","category":"식비"}]

텍스트: ${text}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://togetbudget.vercel.app",
      },
      body: JSON.stringify({
        model: "qwen/qwen-2.5-72b-instruct",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
        max_tokens: 512,
      }),
    });

    const data = await response.json();
    console.log("OpenRouter status:", response.status);
    console.log("Raw content:", data.choices?.[0]?.message?.content);
    console.log("Error:", data.error);
    const raw = data.choices?.[0]?.message?.content || "[]";
    const clean = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = [];
    }

    return res.status(200).json({ transactions: Array.isArray(parsed) ? parsed : [parsed] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
