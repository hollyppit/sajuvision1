// 디버그용: mTLS 연결 테스트 엔드포인트
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function onRequestGet(context) {
  const results = {};

  // 1. 바인딩 확인
  results.hasMtls = !!context.env.TOSS_MTLS;
  results.mtlsType = typeof context.env.TOSS_MTLS;
  results.mtlsMethods = context.env.TOSS_MTLS
    ? Object.getOwnPropertyNames(Object.getPrototypeOf(context.env.TOSS_MTLS)).join(', ')
    : 'N/A';

  // 2. mTLS로 토스 API 루트 접속 테스트
  if (context.env.TOSS_MTLS) {
    try {
      const res = await context.env.TOSS_MTLS.fetch('https://apps-in-toss-api.toss.im/');
      const body = await res.text();
      results.mtlsRoot = { status: res.status, body: body.slice(0, 300) };
    } catch (err) {
      results.mtlsRoot = { error: err.message, stack: err.stack?.slice(0, 200) };
    }
  }

  // 3. 일반 fetch로 토스 API 접속 테스트
  try {
    const res = await fetch('https://apps-in-toss-api.toss.im/');
    const body = await res.text();
    results.normalRoot = { status: res.status, body: body.slice(0, 300) };
  } catch (err) {
    results.normalRoot = { error: err.message };
  }

  // 4. mTLS로 토큰 엔드포인트 POST 테스트
  if (context.env.TOSS_MTLS) {
    try {
      const res = await context.env.TOSS_MTLS.fetch(
        'https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/user/oauth2/generate-token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authorizationCode: 'test', referrer: 'DEFAULT' }),
        },
      );
      const body = await res.text();
      results.mtlsToken = { status: res.status, body: body.slice(0, 500) };
    } catch (err) {
      results.mtlsToken = { error: err.message };
    }
  }

  return new Response(JSON.stringify(results, null, 2), { headers: CORS_HEADERS });
}
