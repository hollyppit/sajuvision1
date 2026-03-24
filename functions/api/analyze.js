export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const body = await context.request.json();
    const { prompt, photo } = body;

    const OPENAI_KEY = context.env.OPENAI_KEY;
    // OpenAI 호출
    const result = await callOpenAI(OPENAI_KEY, prompt, photo);
    return new Response(JSON.stringify({ text: result }), { headers: corsHeaders });

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

async function callOpenAI(apiKey, prompt, photo) {
  const userContent = [];
  if (photo) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${photo.mediaType};base64,${photo.base64}` },
    });
  }
  userContent.push({ type: 'text', text: prompt });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2000,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI 오류: ${err.error?.message || res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
