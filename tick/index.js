// GitHub 예약 실행 대신 게시 워크플로를 깨우는 Cloudflare cron(2026-11-15).
//
// 왜: GitHub 의 schedule('*/20')이 실제로는 하루 2~3번만 떴다(11-12~15 실행 기록 — 카드·릴스 둘 다). 한 번 실패하면 따라잡을
//   기회가 없어 릴스가 11-14 오전 이후 멈췄다. Cloudflare cron 은 정시에 뜬다.
// 무엇을: 20분마다 repository_dispatch(event_type 'tick') 하나만 보낸다. 올릴지 말지는 여전히 slot-gate.ts 가 정한다 —
//   workflow_dispatch 는 관문을 건너뛰는 「수동 실행」이라 쓰지 않는다.
// 비용: 하루 48회 × 외부 요청 1건. Durable Object·D1·KV 를 쓰지 않는다 — 무료 플랜 한도의 0.05%.
// 비밀값: GITHUB_TOKEN = 세분화(fine-grained) 토큰, 저장소 lumiya2026/lumiya-poster 하나, 권한 Contents: Read and write 만.
const REPO = 'lumiya2026/lumiya-poster';

export default {
  async scheduled(_ev, env, ctx) {
    ctx.waitUntil(dispatch(env));
  },
  // 수동 확인용 — 아무 요청에나 404. 주소가 없다(workers_dev false, routes 없음)
  async fetch() {
    return new Response('not found', { status: 404 });
  },
};

async function dispatch(env) {
  if (!env.GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN 없음 — wrangler secret put GITHUB_TOKEN');
    return;
  }
  const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'lumiya-poster-tick',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'tick' }),
  });
  // 성공은 204. 실패는 Cloudflare 로그(observability)에 남는다
  if (r.status !== 204) console.error('dispatch 실패', r.status, (await r.text()).slice(0, 300));
}
