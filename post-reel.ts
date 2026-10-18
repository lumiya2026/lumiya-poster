/**
 * 릴스 큐의 가장 오래된 항목 하나를 인스타그램에 올린다
 *   npx tsx post-reel.ts
 *
 * GitHub Actions 워크플로(.github/workflows/post-reel.yml)가 하루 한 번(21:00 JST)
 * 이 스크립트를 부른다 — post.ts(카드뉴스, 하루 3번)와는 **별도 큐·별도 스케줄**이다.
 * 합치지 않은 이유: 릴스는 카드뉴스와 같은 한자를 쓰지만 권장 게시 시각이 다르다
 * (03_KDK `scripts/social/generate.ts` 의 REEL_SUGGESTED_TIME_JST 참고 — 카드뉴스
 * 마지막 슬롯(19:30 JST) 직후에 또 올리면 같은 계정이 30분 안에 두 번 노출된다).
 *
 * 실패하면(네트워크·API 오류·영상 트랜스코딩 타임아웃) 큐에 그대로 남겨둔다 —
 * 다음 스케줄이 같은 항목을 다시 시도한다. 성공한 뒤에만 reel-queue/ 에서
 * posted-reels/ 로 옮긴다(post.ts 와 같은 안전 원칙).
 */
import { readdirSync, readFileSync, renameSync } from 'node:fs';
import { publishReel } from './graph-api';

const IG_USER_ID = need('IG_USER_ID');
const ACCESS_TOKEN = need('IG_ACCESS_TOKEN');
const REPO = process.env.GITHUB_REPOSITORY ?? need('REPO_FALLBACK');
const BRANCH = process.env.GITHUB_REF_NAME ?? 'main';

function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`환경변수 ${key} 가 없다 — README 의 시크릿 설정을 확인해라`);
  return v;
}

function rawUrl(pathInRepo: string): string {
  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${pathInRepo}`;
}

function nextQueueItem(): string | null {
  const dirs = readdirSync('reel-queue', { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(); // "2026-10-19-reel-音" 형태라 이름 정렬 = 날짜 순
  return dirs[0] ?? null;
}

async function main() {
  const item = nextQueueItem();
  if (!item) {
    console.log('릴스 큐가 비어 있다 — 03_KDK 에서 generate.ts 를 돌려 채워야 한다');
    return;
  }

  const dir = `reel-queue/${item}`;
  const files = readdirSync(dir);
  const videoFile = files.find((f) => f.endsWith('.mp4'));
  if (!videoFile) throw new Error(`${dir} 에 .mp4 파일이 없다`);
  const caption = readFileSync(`${dir}/caption.txt`, 'utf8');

  console.log(`▶ ${item} 게시 시작 (${videoFile})`);
  const videoUrl = rawUrl(`${dir}/${videoFile}`);

  const mediaId = await publishReel({
    igUserId: IG_USER_ID,
    accessToken: ACCESS_TOKEN,
    videoUrl,
    caption,
  });

  console.log(`✓ 게시 완료 — media id ${mediaId}`);

  renameSync(dir, `posted-reels/${item}`);
  console.log(`✓ reel-queue/${item} → posted-reels/${item} 로 옮김`);
}

main().catch((e) => {
  console.error('✗ 게시 실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
