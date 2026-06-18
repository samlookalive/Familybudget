export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { imageBase64, mode } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 is required" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const today = new Date().toISOString().slice(0, 10);

  const singlePrompt = `오늘 날짜는 ${today}이야.
이 이미지에서 카드/결제 내역을 추출해줘.
카테고리: 식비, 교통, 쇼핑, 의료/건강, 생활/마트, 문화/여가, 여행, 월세/관리비, 구독서비스, 통신비, 교육, 보험, 월급, 부수입, 용돈, 기타수입, 기타
JSON 배열만 반환해. 다른 텍스트 없이.
형식: [{"date":"YYYY-MM-DD","amount":숫자,"memo":"가맹점명","type":"expense 또는 income","category":"카테고리"}]`;

  const groupPrompt = `오늘 날짜는 ${today}이야.
이 이미지의 내역들을 하나의 묶음으로 추출해줘.
카테고리: 식비, 교통, 쇼핑, 의료/건강, 생활/마트, 문화/여가, 여행, 월세/관리비, 구독서비스, 통신비, 교육, 보험, 기타
JSON만 반환해. 다른 텍스트 없이.
형식: {"group_name":"묶음명","category":"대표카테고리","date":"YYYY-MM-DD","children":[{"memo":"항목명","amount":숫자,"category":"카테고리"}]}`;

  const prompt = mode === "group" ? groupPrompt : singlePrompt;

  // 1차 모델이 실패(429/5xx 등)하면 2차 모델로 자동 재시도
  const MODELS = ["nvidia/nemotron-nano-12b-v2-vl:free", "google/gemma-4-31b-it:free"];

  let response, rawText, usedModel, lastErrorText;
  for (const model of MODELS) {
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://togetbudget.vercel.app",
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
              { type: "text", text: prompt }
            ]
          }],
          temperature: 0,
          max_tokens: 1024,
        }),
      });
    } catch (e) {
      lastErrorText = "OpenRouter 호출 실패: " + e.message;
      continue; // 네트워크 에러 → 다음 모델로
    }

    // 응답을 text로 먼저 받아서 안전하게 처리
    rawText = await response.text();
    if (response.ok) {
      usedModel = model;
      break; // 성공 → 더 이상 재시도 안 함
    }
    lastErrorText = `OpenRouter ${response.status} (${model}): ${rawText.slice(0,300)}`;
    // 실패 → 다음 모델로 재시도
  }

  if (!response || !response.ok) {
    return res.status(500).json({ error: lastErrorText || "모든 모델 호출 실패" });
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    return res.status(500).json({ error: "OpenRouter 응답 JSON 파싱 실패: " + rawText.slice(0,300) });
  }

  const raw = data.choices?.[0]?.message?.content || (mode === "group" ? "{}" : "[]");
  const clean = raw.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    return res.status(500).json({ error: "결과 파싱 실패: " + clean.slice(0,300) });
  }

  if (mode === "group") {
    return res.status(200).json({ group: parsed, _debug: { usedModel, rawModelOutput: raw } });
  } else {
    return res.status(200).json({ transactions: Array.isArray(parsed) ? parsed : [], _debug: { usedModel, rawModelOutput: raw } });
  }
}
