/**
 * Cloudflare Pages Function
 * POST /api/toss-disconnect
 *
 * 토스 로그인 "연결 끊기" 콜백 엔드포인트.
 * 사용자가 토스 앱에서 운명의 거울 연결을 해제하면 토스 서버가 이 URL로 요청을 보냅니다.
 * Authorization: Basic {Basic Auth 헤더} 포함.
 */
export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  try {
    // Basic Auth 검증 (토스 콘솔에 등록한 값과 일치해야 함)
    const authHeader = context.request.headers.get('Authorization') || '';
    const expectedAuth = context.env.TOSS_DISCONNECT_AUTH; // 환경변수: "Basic base64(id:secret)"
    if (expectedAuth && authHeader !== expectedAuth) {
      console.warn('[toss-disconnect] Unauthorized request', { authHeader });
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // 요청 바디 파싱
    let body = {};
    try {
      body = await context.request.json();
    } catch (_) {
      // body가 없거나 JSON이 아닌 경우 무시
    }

    // 토스에서 전달하는 사용자 식별자 (user_id 또는 ci 등)
    const { user_id, ci } = body;

    console.log('[toss-disconnect] 연결 끊기 요청 수신', {
      user_id: user_id ?? '(없음)',
      ci: ci ?? '(없음)',
      timestamp: new Date().toISOString(),
    });

    // TODO: 필요 시 DB에서 해당 사용자 토큰/세션 삭제 처리 추가

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (err) {
    console.error('[toss-disconnect] 처리 중 오류', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// OPTIONS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
