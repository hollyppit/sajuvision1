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

  // 4. connect() API로 raw TCP+TLS 연결 테스트
  if (context.env.TOSS_MTLS) {
    try {
      const socket = context.env.TOSS_MTLS.connect('apps-in-toss-api.toss.im:443', {
        secureTransport: 'on',
        expectedServerHostname: 'apps-in-toss-api.toss.im',
      });

      const body = JSON.stringify({ authorizationCode: 'test', referrer: 'DEFAULT' });
      const httpReq = [
        'POST /api-partner/v1/apps-in-toss/user/oauth2/generate-token HTTP/1.1',
        'Host: apps-in-toss-api.toss.im',
        'Content-Type: application/json',
        `Content-Length: ${body.length}`,
        'Connection: close',
        '',
        body,
      ].join('\r\n');

      const writer = socket.writable.getWriter();
      await writer.write(new TextEncoder().encode(httpReq));
      await writer.close();

      const reader = socket.readable.getReader();
      let responseText = '';
      const timeout = setTimeout(() => reader.cancel(), 5000);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          responseText += new TextDecoder().decode(value);
          if (responseText.length > 2000) break;
        }
      } catch {}
      clearTimeout(timeout);
      results.connectTest = { success: true, response: responseText.slice(0, 500) };
    } catch (err) {
      results.connectTest = { error: err.message, name: err.name };
    }
  }

  // 5. mTLS fetch with Request object
  if (context.env.TOSS_MTLS) {
    try {
      const req = new Request('https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/user/oauth2/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorizationCode: 'test', referrer: 'DEFAULT' }),
      });
      const res = await context.env.TOSS_MTLS.fetch(req);
      const body = await res.text();
      results.mtlsFetchReq = { status: res.status, body: body.slice(0, 500) };
    } catch (err) {
      results.mtlsFetchReq = { error: err.message };
    }
  }

  return new Response(JSON.stringify(results, null, 2), { headers: CORS_HEADERS });
}
