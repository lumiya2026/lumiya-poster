/**
 * Instagram Graph API — 캐러셀 게시 최소 구현
 *
 * 공식 문서 기준 흐름(2026-09 확인):
 *   1) 이미지마다 컨테이너 생성(POST /{ig-user-id}/media, is_carousel_item=true)
 *   2) 부모 캐러셀 컨테이너 생성(media_type=CAROUSEL, children=[...])
 *   3) 부모 컨테이너가 FINISHED 될 때까지 폴링(GET /{id}?fields=status_code)
 *   4) 게시(POST /{ig-user-id}/media_publish, creation_id=부모)
 *
 * 이미지 URL은 반드시 "공개적으로 접근 가능"해야 한다 — Meta 서버가 그 URL로 직접
 * 가져가기 때문이다. 로컬 파일을 그대로 못 준다(README 의 "저장소를 public 으로
 * 두는 이유" 참조).
 *
 * Graph API 버전은 시간이 지나면 구버전이 폐기된다 — 이 상수만 바꾸면 된다.
 */
const API_VERSION = 'v21.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

async function call(path: string, params: Record<string, string>): Promise<any> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json: any = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`Graph API 오류 (${path}): ${JSON.stringify(json.error ?? json)}`);
  }
  return json;
}

async function getStatus(containerId: string, accessToken: string): Promise<string> {
  const url = `${BASE}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const json: any = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`상태 조회 오류: ${JSON.stringify(json.error ?? json)}`);
  }
  return json.status_code as string;
}

/** FINISHED 될 때까지 기다린다. ERROR 면 즉시 던진다 — 조용히 실패하지 않는다 */
async function waitUntilFinished(
  containerId: string,
  accessToken: string,
  { intervalMs = 3000, timeoutMs = 120_000 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await getStatus(containerId, accessToken);
    if (status === 'FINISHED') return;
    if (status === 'ERROR') throw new Error(`컨테이너 ${containerId} 처리 실패(ERROR)`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`컨테이너 ${containerId} 가 ${timeoutMs}ms 안에 FINISHED 되지 않았다(타임아웃)`);
}

export interface PublishCarouselInput {
  igUserId: string;
  accessToken: string;
  imageUrls: string[];
  caption: string;
}

/** 캐러셀 하나를 통째로 게시한다. 성공하면 게시된 미디어 id 를 돌려준다 */
export async function publishCarousel({
  igUserId,
  accessToken,
  imageUrls,
  caption,
}: PublishCarouselInput): Promise<string> {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`캐러셀은 2~10장만 된다 — 지금 ${imageUrls.length}장`);
  }

  const childIds: string[] = [];
  for (const imageUrl of imageUrls) {
    const child = await call(`/${igUserId}/media`, {
      image_url: imageUrl,
      is_carousel_item: 'true',
      access_token: accessToken,
    });
    childIds.push(child.id);
  }

  const parent = await call(`/${igUserId}/media`, {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption,
    access_token: accessToken,
  });

  await waitUntilFinished(parent.id, accessToken);

  const published = await call(`/${igUserId}/media_publish`, {
    creation_id: parent.id,
    access_token: accessToken,
  });

  return published.id;
}
