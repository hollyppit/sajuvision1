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
function fromBase64(str) {
  // URL-safe base64 → standard base64 정규화
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  // 4의 배수로 패딩
  const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '=');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

async function tryDecrypt(keyBytes, encrypted, useAad) {
  const aesKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt'],
  );
  const iv = encrypted.slice(0, 12);
  const cipherData = encrypted.slice(12);
  const params = useAad
    ? { name: 'AES-GCM', iv, additionalData: GCM_AAD, tagLength: 128 }
    : { name: 'AES-GCM', iv, tagLength: 128 };
  const buf = await crypto.subtle.decrypt(params, aesKey, cipherData);
  return JSON.parse(new TextDecoder().decode(buf));
}

async function decryptAuthCode(encryptedBase64, rawKey) {
  const encrypted = fromBase64(encryptedBase64);

  // 시도 1: base64 디코딩 키 + AAD
  try {
    return await tryDecrypt(fromBase64(rawKey), encrypted, true);
  } catch {}

  // 시도 2: base64 디코딩 키 + AAD 없음
  try {
    return await tryDecrypt(fromBase64(rawKey), encrypted, false);
  } catch {}

  // 시도 3: SHA-256 해싱 키 + AAD
  try {
    const sha = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey));
    return await tryDecrypt(new Uint8Array(sha), encrypted, true);
  } catch {}

  // 시도 4: SHA-256 해싱 키 + AAD 없음
  const sha = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey));
  return await tryDecrypt(new Uint8Array(sha), encrypted, false);
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
      console.log('[toss-login] authorizationCode 앞 50자:', authorizationCode?.slice(0, 50));
      console.log('[toss-login] authorizationCode 길이:', authorizationCode?.length);
      console.log('[toss-login] decryptKey 길이:', decryptKey?.length);
      userInfo = await decryptAuthCode(authorizationCode, decryptKey);
    } catch (err) {
      const keyBytes = fromBase64(decryptKey);
      const codeBytes = fromBase64(authorizationCode);
      return json({ error: `복호화실패[${err.name}] keyBytes:${keyBytes.length} codeBytes:${codeBytes.length} iv:${codeBytes.slice(0,12)} aad:${new TextDecoder().decode(GCM_AAD)}` }, 500);
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
