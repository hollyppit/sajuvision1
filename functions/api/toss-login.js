/**
 * Cloudflare Pages Function
 * POST /api/toss-login
 *
 * 토스 SDK appLogin()이 반환한 authorizationCode를 받아
 * 1) 토스 API로 accessToken 발급 (mTLS 필수)
 * 2) accessToken으로 사용자 정보 조회 (mTLS 필수)
 * 3) 암호화된 필드를 AES-256-GCM으로 복호화
 * 하여 사용자 정보를 반환합니다.
 *
 * 필요 환경변수 (Cloudflare Pages > Settings > Environment Variables):
 *   TOSS_LOGIN_DECRYPT_KEY  - 앱인토스 콘솔에서 이메일로 발급한 복호화 키 (Base64)
 *
 * 필요 바인딩 (Cloudflare Pages > Settings > Functions > mTLS certificates):
 *   TOSS_MTLS  - 앱인토스 콘솔에서 발급한 mTLS 인증서 바인딩
 */

const TOSS_API_BASE = 'https://apps-in-toss-api.toss.im';
const GCM_AAD = new TextEncoder().encode('TOSS');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ── Base64 유틸 ──
function fromBase64(str) {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '=');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

// ── AES-256-GCM 개별 필드 복호화 ──
async function decryptField(encryptedBase64, keyBytes) {
  const encrypted = fromBase64(encryptedBase64);
  const iv = encrypted.slice(0, 12);
  const cipherData = encrypted.slice(12);

  const aesKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt'],
  );

  // AAD 있는 경우 시도
  try {
    const buf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: GCM_AAD, tagLength: 128 },
      aesKey, cipherData,
    );
    return new TextDecoder().decode(buf);
  } catch {}

  // AAD 없는 경우 시도
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    aesKey, cipherData,
  );
  return new TextDecoder().decode(buf);
}

// ── 안전한 JSON 파싱 ──
async function safeJson(res, label) {
  const text = await res.text();
  console.log(`[toss-login] ${label} status:${res.status} body:${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} 응답 파싱 실패 (status ${res.status}): ${text.slice(0, 200)}`);
  }
}

// ── mTLS fetch 헬퍼: 바인딩이 있으면 mTLS, 없으면 일반 fetch ──
function mtlsFetch(env) {
  if (env.TOSS_MTLS) {
    console.log('[toss-login] mTLS 바인딩 사용');
    return env.TOSS_MTLS.fetch.bind(env.TOSS_MTLS);
  }
  console.warn('[toss-login] TOSS_MTLS 바인딩 없음 → 일반 fetch 사용 (mTLS 필요 시 실패할 수 있음)');
  return fetch;
}

// ── 1단계: authorizationCode → accessToken 발급 ──
async function exchangeToken(authorizationCode, referrer, fetchFn) {
  const res = await fetchFn(
    `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/generate-token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizationCode, referrer }),
    },
  );

  const data = await safeJson(res, '토큰 발급');

  if (!res.ok || data.resultType === 'FAIL') {
    const reason = data.error?.reason || data.error || '토큰 발급 실패';
    throw new Error(`토큰 발급 실패: ${reason}`);
  }

  return data.success?.accessToken || data.accessToken;
}

// ── 2단계: accessToken → 사용자 정보 조회 ──
async function fetchUserInfo(accessToken, fetchFn) {
  const res = await fetchFn(
    `${TOSS_API_BASE}/api-partner/v1/apps-in-toss/user/oauth2/login-me`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  const data = await safeJson(res, '사용자 조회');

  if (!res.ok || data.resultType === 'FAIL') {
    const reason = data.error?.reason || data.error || '사용자 정보 조회 실패';
    throw new Error(`사용자 정보 조회 실패: ${reason}`);
  }

  return data.success || data;
}

// ── 핸들러 ──
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  try {
    const { authorizationCode, referrer } = await context.request.json();
    const envKeys = Object.keys(context.env).filter(k => !k.startsWith('__'));
    console.log('[toss-login] 요청 수신', {
      referrer,
      codeLen: authorizationCode?.length,
      hasMtls: !!context.env.TOSS_MTLS,
      mtlsType: typeof context.env.TOSS_MTLS,
      envKeys,
    });

    if (!authorizationCode) {
      return json({ error: 'authorizationCode가 없습니다.' }, 400);
    }

    // 샌드박스 환경: mock 사용자 데이터 반환
    if (typeof referrer === 'string' && referrer.toLowerCase() === 'sandbox') {
      console.log('[toss-login] 샌드박스 환경 감지 → mock 데이터 반환');
      return json({
        name: '테스트유저',
        birthdate: '19900101',
        gender: 'female',
        referrer,
      }, 200);
    }

    const decryptKey = context.env.TOSS_LOGIN_DECRYPT_KEY;
    if (!decryptKey) {
      console.error('[toss-login] 환경변수 TOSS_LOGIN_DECRYPT_KEY 누락');
      return json({ error: '서버 설정 오류' }, 500);
    }

    // mTLS fetch 함수 준비
    const fetchFn = mtlsFetch(context.env);

    // 1) accessToken 발급
    let accessToken;
    try {
      accessToken = await exchangeToken(authorizationCode, referrer, fetchFn);
    } catch (err) {
      console.error('[toss-login] 토큰 발급 실패', err);
      return json({ error: err.message, hasMtls: !!context.env.TOSS_MTLS }, 500);
    }

    if (!accessToken) {
      console.error('[toss-login] accessToken이 비어있음');
      return json({ error: '토큰 발급 실패: accessToken 없음' }, 500);
    }

    // 2) 사용자 정보 조회
    let userInfo;
    try {
      userInfo = await fetchUserInfo(accessToken, fetchFn);
    } catch (err) {
      console.error('[toss-login] 사용자 정보 조회 실패', err);
      return json({ error: err.message }, 500);
    }

    // 3) 암호화된 필드 복호화
    const keyBytes = fromBase64(decryptKey);
    let name = '', birthdate = '', gender = '';

    try {
      if (userInfo.name) {
        name = await decryptField(userInfo.name, keyBytes);
      }
      if (userInfo.birthday) {
        birthdate = await decryptField(userInfo.birthday, keyBytes);
      }
      if (userInfo.gender) {
        const rawGender = await decryptField(userInfo.gender, keyBytes);
        // 토스 API: MALE/FEMALE → 프론트엔드: male/female
        gender = rawGender.toLowerCase();
      }
    } catch (err) {
      console.error('[toss-login] 필드 복호화 실패', err);
      return json({ error: '사용자 정보 복호화 실패' }, 500);
    }

    const payload = { name, birthdate, gender, referrer };
    console.log('[toss-login] 로그인 성공', { name, referrer });
    return json(payload, 200);

  } catch (err) {
    console.error('[toss-login] 처리 중 오류', err);
    return json({ error: err.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}
