export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const { prompt } = await context.request.json();
    const GEMINI_KEY = context.env.GEMINI_KEY;

    const models = [
      'gemini-2.0-flash-preview-image-generation',
      'gemini-2.5-flash-preview-image-generation',
      'gemini-2.0-flash-exp'
    ];

    let lastError = '';

    for (const model of models) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
        
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
        });

        if (!res.ok) {
          const errTxt = await res.text().catch(() => "");
          throw new Error(`[${model}] 오류(${res.status}): ${errTxt}`);
        }

        const data = await res.json();
        const parts = data.candidates?.[0]?.content?.parts || [];

        for (const part of parts) {
          if (part.inlineData?.mimeType?.startsWith('image/')) {
            return new Response(
              JSON.stringify({
                imageData: part.inlineData.data,
                mimeType: part.inlineData.mimeType,
              }),
              { headers: corsHeaders }
            );
          }
        }
        throw new Error(`[${model}] 이미지 데이터를 찾을 수 없습니다`);
      } catch (e) {
        lastError += e.message + ' | ';
        console.warn(`${model} 시도 실패:`, e.message);
      }
    }

    let availableModels = '';
    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}`);
      if (listRes.ok) {
        const listData = await listRes.json();
        availableModels = listData.models.map(m => m.name.split('/')[1]).filter(n => n.includes('image') || n.includes('flash')).join(', ');
      }
    } catch(e) {}

    throw new Error(`모든 Gemini 모델 실패:\n${lastError}\n\n[참고] 이 API 키로 사용 가능한 관련 모델들: ${availableModels}`);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
