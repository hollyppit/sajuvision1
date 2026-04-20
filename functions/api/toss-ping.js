export async function onRequest(context) {
  const results = {};

  try {
    const r1 = await fetch('https://apps-in-toss-api.toss.im/', { method: 'GET' });
    results.plain_root = { status: r1.status, body: (await r1.text()).slice(0, 200) };
  } catch (e) { results.plain_root = { error: e.message }; }

  try {
    const r2 = await fetch('https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/user/oauth2/generate-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authorizationCode: 'x', referrer: 'x' }),
    });
    results.plain_oauth = { status: r2.status, body: (await r2.text()).slice(0, 200) };
  } catch (e) { results.plain_oauth = { error: e.message }; }

  if (context.env.TOSS_MTLS) {
    try {
      const r3 = await context.env.TOSS_MTLS.fetch('https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/user/oauth2/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorizationCode: 'x', referrer: 'x' }),
      });
      results.mtls_oauth = { status: r3.status, body: (await r3.text()).slice(0, 400), headers: Object.fromEntries(r3.headers) };
    } catch (e) { results.mtls_oauth = { error: e.message }; }

    try {
      const r4 = await context.env.TOSS_MTLS.fetch('https://apps-in-toss-api.toss.im/api-partner/v1/apps-in-toss/user/oauth2/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorizationCode: 'x', referrer: 'x' }),
        cf: { resolveOverride: '117.52.3.192' },
      });
      results.mtls_oauth_ip = { status: r4.status, body: (await r4.text()).slice(0, 400), headers: Object.fromEntries(r4.headers) };
    } catch (e) { results.mtls_oauth_ip = { error: e.message }; }
  }

  try {
    const r5 = await fetch('https://apps-in-toss-api.toss.im/', {
      method: 'GET',
      cf: { resolveOverride: '117.52.3.192' },
    });
    results.plain_ip = { status: r5.status, body: (await r5.text()).slice(0, 200) };
  } catch (e) { results.plain_ip = { error: e.message }; }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
