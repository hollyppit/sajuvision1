export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const { photo } = await context.request.json();
    const GEMINI_KEY = context.env.GEMINI_KEY;

    // Use specific image generation capable models
    const models = [
      'gemini-2.5-flash-image',
      'gemini-3.1-flash-image-preview',
    ];

    let lastError = '';

    for (const model of models) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType: photo.mediaType, data: photo.base64 } },
                { text: "Convert this person into a stylized Korean manhwa/webtoon illustration character. Keep the facial features and proportions similar but render as a detailed anime/manhwa style character illustration. Clean line art, expressive eyes, artistic style. Do not make it photorealistic." }
              ]
            }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          lastError += `[${model}] ${res.status}: ${errText.slice(0, 200)} | `;
          continue;
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
        lastError += `[${model}] 이미지 파트 없음 | `;
      } catch (e) {
        lastError += `[${model}] 예외: ${e.message} | `;
      }
    }

    throw new Error(`캐리커처 변환 실패: ${lastError}`);
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
