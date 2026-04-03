/**
 * Cloudflare Pages Function
 * POST /api/toss-login
 *
 * 토스 SDK appLogin()이 반환한 authorizationCode를 받아
 * AES-256-GCM으로 복호화하여 사용자 정보를 반환합니다.
 *
 * 필요 환경변수 (Cloudflare Pages > Settings > Environment Variables):
 *   TOSS_LOGIN_DECRYPT_KEY  - 앱인토스 콘솔에서 발급한 사용자 정보 복호화 키
 */

// AES-256-GCM AAD (토스 고정값)
const GCM_AAD = new TextEncoder().encode('TOSS');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

/**
 * AES-256-GCM 복호화 (Cloudflare Workers Web Crypto API)
 *
 * 토스 암호화 형식: Base64( IV[12 bytes] | Ciphertext | AuthTag[16 bytes] )
 *
 * @param {string} encryptedBase64 - appLogin()이 반환한 authorizationCode
 * @param {string} rawKey          - TOSS_LOGIN_DECRYPT_KEY 환경변수 값
 * @returns {Promise<object>}       - 복호화된 사용자 정보 JSON
 */
async function decryptAuthCode(encryptedBase64, rawKey) {
  // 1) UTF-8 문자열 키 → SHA-256 해시 → 32바이트 AES 키
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

  // 3) IV(12) | Ciphertext+AuthTag(16) 분리
  const iv         = encrypted.slice(0, 12);
  const cipherData = encrypted.slice(12);

  // 4) 복호화
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: GCM_AAD, tagLength: 128 },
    aesKey,
    cipherData,
  );

  return JSON.parse(new TextDecoder().decode(plainBuffer));
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const { authorizationCode, referrer } = await context.request.json();

    if (!authorizationCode) {
      return json({ error: 'authorizationCode가 없습니다.' }, 400);
    }

    const decryptKey = context.env.TOSS_LOGIN_DECRYPT_KEY;
    if (!decryptKey) {
      console.error('[toss-login] 환경변수 TOSS_LOGIN_DECRYPT_KEY 누락');
      return json({ error: '서버 설정 오류' }, 500);
    }

    // authorizationCode 복호화 → 사용자 정보
    let userInfo;
    try {
      userInfo = await decryptAuthCode(authorizationCode, decryptKey);
    } catch (err) {
      console.error('[toss-login] 복호화 실패', err);
      return json({ error: '사용자 정보 복호화 실패' }, 500);
    }

    // 프론트엔드에 필요한 필드만 반환
    // 복호화 결과 필드: name, birthdate(YYYYMMDD), gender('male'|'female')
    const payload = {
      name:      userInfo.name      ?? '',
      birthdate: userInfo.birthdate ?? '',
      gender:    userInfo.gender    ?? '',
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
