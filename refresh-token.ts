/**
 * 액세스 토큰 갱신 — 장기 토큰은 60일마다 만료된다
 *   npx tsx refresh-token.ts
 *
 * fb_exchange_token 방식(Meta 개발자 앱의 App ID·App Secret 필요)으로 새 장기 토큰을 받는다.
 * 이 스크립트는 **새 토큰을 표준출력에 한 줄로 찍기만** 한다 — 실제로 그 값을
 * GitHub Secret 에 다시 써넣는 건 워크플로(.github/workflows/refresh-token.yml)가
 * `gh secret set` 으로 한다. sealed-box 암호화를 직접 구현하지 않는 이유는, 이미 잘
 * 검증된 `gh` CLI 가 그걸 대신해주는데 더 짤 이유가 없어서다.
 */
const APP_ID = need('META_APP_ID');
const APP_SECRET = need('META_APP_SECRET');
const CURRENT_TOKEN = need('IG_ACCESS_TOKEN');

function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`환경변수 ${key} 가 없다`);
  return v;
}

async function main() {
  const url =
    `https://graph.facebook.com/v21.0/oauth/access_token` +
    `?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}` +
    `&fb_exchange_token=${encodeURIComponent(CURRENT_TOKEN)}`;
  const res = await fetch(url);
  const json: any = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`토큰 갱신 실패: ${JSON.stringify(json.error ?? json)}`);
  }
  // 다음 줄만 워크플로가 파싱한다 — 다른 로그를 여기 섞지 않는다
  console.log(json.access_token);
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e);
  process.exit(1);
});
