export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const { paymentKey, orderId, amount } = await context.request.json();

    if (!paymentKey || !orderId || !amount) {
      return new Response(JSON.stringify({ error: '필수 파라미터 누락', unlocked: false }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 환경변수에서 시크릿 키 로드 (계약 체결 전: 테스트 키 사용)
    const secretKey = context.env.TOSS_PAY_SECRET_KEY || 'test_sk_zXLkKEypNArWmo50nX3lmeaxYG5R';
    const credentials = btoa(secretKey + ':');

    const verifyRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      return new Response(JSON.stringify({
        error: err.message || '결제 검증 실패',
        unlocked: false,
      }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const paymentData = await verifyRes.json();

    return new Response(JSON.stringify({
      unlocked: true,
      paymentKey: paymentData.paymentKey,
      status: paymentData.status,
    }), { headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, unlocked: false }), {
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
