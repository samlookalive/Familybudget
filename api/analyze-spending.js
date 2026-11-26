// 홈 화면 "AI 지출 분석" 카드용 서버 함수
// - 앱이 계산한 요약 숫자(summary)만 받아서, AI가 문장으로 풀어쓴 결과를 돌려줍니다.
// - 거래 내역 원본/사용처 이름은 받지도, 보내지도 않습니다.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mode, summary } = req.body || {};
  if ((mode !== "current" && mode !== "lastMonth") || !summary || typeof summary !== "object") {
    return res.status(400).json({ error: "mode and summary are required" });
  }

  const summaryText = JSON.stringify(summary);
  if (summaryText.length > 6000) {
    return res.status(413).json({ error: "summary too large" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const rules = `당신은 가계부 앱의 지출 분석 도우미입니다. 아래 JSON 데이터만 근거로 분석하세요.

규칙:
- 데이터에 없는 숫자를 만들거나 새로 계산하지 마세요. 금액은 데이터의 값을 그대로 쓰거나 "약 9만원"처럼 읽기 쉽게 줄여 쓰세요.
- 지출이 늘거나 줄어든 이유는 추측하거나 단정하지 마세요. 숫자로 확인되는 사실만 말하세요.
- 투자, 주식, 환율, 금융상품에 대한 조언은 하지 마세요. tip은 증가폭이 큰 항목을 짚어주는 한 문장으로만 쓰고, 짚을 만한 항목이 없으면 빈 문자열로 두세요.
- 훈계하거나 겁주는 말투는 쓰지 마세요. 친근한 존댓말("~예요", "~해요")로 쓰세요.
- hasComparison이 false이면 비교 문장은 쓰지 말고 금액과 비중만 설명하세요.
- 반드시 아래 JSON만 출력하세요. 마크다운이나 설명은 붙이지 마세요.
{"headline":"한 문장 요약","points":["포인트1","포인트2"],"tip":"한 문장 또는 빈 문자열"}
- points는 2~3개이고 각각 한 문장입니다.`;

  const modeGuide = mode === "current"
    ? `분석 대상은 이번 달 1일부터 오늘까지입니다. headline에서는 thisMonth와 lastMonthSamePeriod를 비교하세요. points에는 biggestChanges 중 증감이 큰 항목 1~2개와, projectedMonthEnd를 lastMonthFull(budget이 있으면 예산)과 비교한 내용을 넣으세요.`
    : `분석 대상은 지난달 한 달 전체입니다. headline에서는 total과 previousMonth.total을 비교하세요. points에는 topCategories에서 비중이 가장 큰 항목과, biggestChanges 중 증감이 큰 항목을 넣으세요.`;

  const prompt = `${rules}\n\n${modeGuide}\n\n데이터:\n${summaryText}`;

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
        temperature: 0.3,
        max_tokens: 700,
      }),
    });

    const rawText = await response.text();
    if (!response.ok) {
      return res.status(502).json({ error: `OpenRouter ${response.status}: ${rawText.slice(0, 200)}` });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return res.status(502).json({ error: "OpenRouter 응답 파싱 실패: " + rawText.slice(0, 200) });
    }

    const raw = data.choices?.[0]?.message?.content || "";
    const clean = raw.replace(/```json|```/g, "").trim();

    let parsed = null;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      // 앞뒤에 설명이 붙어 나온 경우를 대비해 { ... } 부분만 다시 시도
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch (e2) { parsed = null; }
      }
    }

    const analysis = sanitize(parsed);
    if (!analysis) {
      return res.status(502).json({ error: "분석 결과 형식 오류: " + clean.slice(0, 200) });
    }
    return res.status(200).json({ analysis });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// 모델 출력이 기대한 모양이 아니면 버리고, 맞으면 필요한 필드만 정리해서 돌려줍니다.
function sanitize(p) {
  if (!p || typeof p.headline !== "string" || !p.headline.trim()) return null;
  const points = Array.isArray(p.points)
    ? p.points.filter(x => typeof x === "string" && x.trim()).map(x => x.trim()).slice(0, 3)
    : [];
  const tip = typeof p.tip === "string" ? p.tip.trim() : "";
  return { headline: p.headline.trim(), points, tip };
}
