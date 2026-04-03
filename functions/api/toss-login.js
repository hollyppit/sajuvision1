/**
 * Cloudflare Pages Function
 * POST /api/toss-login
 *
 * 토스 appLogin()이 반환한 authorizationCode를 받아
 * 토스 OAuth 서버에서 사용자 정보(이름, 생년월일, 성별)를 조회합니다.
 * 사용자 정보는 AES-256-GCM으로 암호화되어 있으며 복호화 후 반환합니다.
 *
 * 필요 환경변수 (Cloudflare Pages Settings > Environment Variables):
 *   TOSS_CLIENT_ID          - 앱인토스 콘솔에서 발급한 OAuth Client ID
 *   TOSS_CLIENT_SECRET      - 앱인토스 콘솔에서 발급한 OAuth Client Secret
 *   TOSS_LOGIN_DECRYPT_KEY  - 앱인토스 콘솔에서 발급한 사용자 정보 복호화 키
 */

const TOSS_TOKEN_URL    = 'https://api.toss.im/oauth2/token';
const TOSS_USERINFO_URL = 'https://api.toss.im/oauth2/userinfo';

// AES-256-GCM AAD (토스 고정값)
const GCM_AAD = new TextEncoder().encode('TOSS');

/**
 * AES-256-GCM 복호화 (Cloudflare Workers Web Crypto API)
 *
 * 토스 암호화 형식: Base64( IV[12 bytes] | Ciphertext | AuthTag[16 bytes] )
 * Web Crypto AES-GCM decrypt은 AuthTag가 Ciphertext 뒤에 붙어 있는 형식을 기대합니다.
 *
 * @param {string} encryptedBase64 - Base64 인코딩된 암호화 데이터
 * @param {string} rawKey          - TOSS_LOGIN_DECRYPT_KEY 환경변수 값
 * @returns {Promise<object>}       - 복호화된 JSON 객체
 */
async function decryptUserInfo(encryptedBase64, rawKey) {
  // 1) 키 재료: UTF-8 문자열을 SHA-256 해시 → 32바이트 AES 키
  const keyMaterial = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(rawKey),
  );
  const aesKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  // 2) Base64 → Uint8Array
  const encrypted = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

  // 3) IV(12) | Ciphertext+AuthTag 분리
  const iv         = encrypted.slice(0, 12);
  const cipherData = encrypted.slice(12); // Ciphertext + AuthTag(16) 포함

  // 4) 복호화
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: GCM_AAD, tagLength: 128 },
    aesKey,
    cipherData,
  );

  return JSON.parse(new TextDecoder().decode(plainBuffer));
}

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
    const decryptKey   = context.env.TOSS_LOGIN_DECRYPT_KEY;

    if (!clientId || !clientSecret) {
      console.error('[toss-login] 환경변수 TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 누락');
      return json({ error: '서버 설정 오류' }, 500);
    }
    if (!decryptKey) {
      console.error('[toss-login] 환경변수 TOSS_LOGIN_DECRYPT_KEY 누락');
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

    const userRaw = await userRes.json();

    // 3) 사용자 정보 복호화
    //    토스 userinfo 응답: { encryptedUserInfo: "Base64..." } 형태로 암호화 전달
    //    복호화 결과 필드: name, birthdate(YYYYMMDD), gender('male'|'female')
    let userInfo;
    if (userRaw.encryptedUserInfo) {
      try {
        userInfo = await decryptUserInfo(userRaw.encryptedUserInfo, decryptKey);
      } catch (decryptErr) {
        console.error('[toss-login] 사용자 정보 복호화 실패', decryptErr);
        return json({ error: '사용자 정보 복호화 실패' }, 500);
      }
    } else {
      // 암호화되지 않은 응답(개발/샌드박스 환경 등)은 그대로 사용
      userInfo = userRaw;
    }

    // 4) 프론트엔드에 필요한 필드만 반환
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
