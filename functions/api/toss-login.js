/**
 * Cloudflare Pages Function
 * POST /api/toss-login
 *
 * 토스 appLogin()이 반환한 authorizationCode를 받아
 * 토스 OAuth 서버에서 사용자 정보(이름, 생년월일, 성별)를 조회합니다.
 *
 * 필요 환경변수 (Cloudflare Pages Settings > Environment Variables):
 *   TOSS_CLIENT_ID     - 앱인토스 콘솔에서 발급한 OAuth Client ID
 *   TOSS_CLIENT_SECRET - 앱인토스 콘솔에서 발급한 OAuth Client Secret
 */

const TOSS_TOKEN_URL  = 'https://api.toss.im/oauth2/token';
const TOSS_USERINFO_URL = 'https://api.toss.im/oauth2/userinfo';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const { authorizationCode, referrer } = await context.request.json();

    if (!authorizationCode) {
      return json({ error: 'authorizationCode가 없습니다.' }, 400);
    }

    const clientId     = context.env.TOSS_CLIENT_ID;
    const clientSecret = context.env.TOSS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[toss-login] 환경변수 TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 누락');
      return json({ error: '서버 설정 오류' }, 500);
    }

    // 1) Authorization Code → Access Token 교환
    const tokenRes = await fetch(TOSS_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`),
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code:          authorizationCode,
        redirect_uri:  '',    // 앱인토스 WebView는 redirect_uri 불필요
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[toss-login] 토큰 교환 실패', tokenRes.status, err);
      return json({ error: '토큰 교환 실패', detail: err }, 502);
    }

    const { access_token } = await tokenRes.json();

    // 2) Access Token으로 사용자 정보 조회
    const userRes = await fetch(TOSS_USERINFO_URL, {
      headers: { 'Authorization': `Bearer ${access_token}` },
    });

    if (!userRes.ok) {
      const err = await userRes.text();
      console.error('[toss-login] 사용자 정보 조회 실패', userRes.status, err);
      return json({ error: '사용자 정보 조회 실패', detail: err }, 502);
    }

    const userInfo = await userRes.json();

    // 3) 프론트엔드에 필요한 필드만 반환
    //    토스 userinfo 응답 필드: name, birthdate(YYYYMMDD), gender('male'|'female')
    const payload = {
      name:      userInfo.name      ?? '',
      birthdate: userInfo.birthdate ?? '',   // YYYYMMDD → index.html 폼 형식으로 변환은 프론트에서
      gender:    userInfo.gender    ?? '',   // 'male' | 'female'
      referrer,
    };

    console.log('[toss-login] 로그인 성공', { name: payload.name, referrer });
    return json(payload, 200);

  } catch (err) {
    console.error('[toss-login] 처리 중 오류', err);
    return json({ error: err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
