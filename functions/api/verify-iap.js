// 인앱결제(IAP) 구매 완료 기록 엔드포인트
// 앱인토스 SDK가 Apple/Google 결제를 검증한 후 orderId를 전달
// 서버는 이를 기록하고 콘텐츠 잠금 해제를 허용
//
// 참고: 앱인토스 IAP API를 통한 서버사이드 검증은 mTLS 인증서 필요
// 현재는 SDK 검증(Apple/Google) 완료 후 orderId를 신뢰하는 방식으로 동작

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestPost(context) {
  try {
    const origin = context.request.headers.get('origin');
    const { orderId, mode, sku } = await context.request.json();
    console.log('[verify-iap] 요청', { origin, orderId, mode, sku });

    if (!orderId || !mode) {
      return new Response(JSON.stringify({ ok: false, error: '필수 파라미터 누락' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const validModes = ['past', 'spouse', 'face'];
    if (!validModes.includes(mode)) {
      return new Response(JSON.stringify({ ok: false, error: '유효하지 않은 mode' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // orderId 형식 기본 검증 (빈 문자열, 비정상 길이 차단)
    if (typeof orderId !== 'string' || orderId.length < 4 || orderId.length > 200) {
      return new Response(JSON.stringify({ ok: false, error: '유효하지 않은 orderId' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 구매 완료 — 콘텐츠 잠금 해제 허용
    return new Response(JSON.stringify({ ok: true, orderId, mode }), {
      headers: corsHeaders,
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
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
