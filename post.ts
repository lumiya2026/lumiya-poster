/**
 * 큐의 가장 오래된 항목 하나를 인스타그램에 올린다
 *   npx tsx post.ts
 *
 * GitHub Actions 워크플로(.github/workflows/post.yml)가 하루 3번 이 스크립트를 부른다.
 * 실패하면(네트워크·API 오류) 큐에 그대로 남겨둔다 — 다음 스케줄이 같은 항목을 다시 시도한다.
 * 성공한 뒤에만 queue/ 에서 posted/ 로 옮긴다(옮기고 나서 커밋하는 건 워크플로가 한다) —
 * README "왜 저장소를 public 으로 두는가" 참조: 이미지가 실제로 인스타그램에 올라간
 * 뒤에는 저장소에 남아 있어도 이미 세상에 공개된 것이라 문제 없다.
 */
import { readdirSync, readFileSync, renameSync } from 'node:fs';
import { publishCarousel } from './graph-api';

const IG_USER_ID = need('IG_USER_ID');
const ACCESS_TOKEN = need('IG_ACCESS_TOKEN');
/** "owner/repo" — GitHub Actions 가 자동으로 채워준다. 로컬 테스트 땐 직접 넣는다 */
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
  const dirs = readdirSync('queue', { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(); // "2026-09-24-slot1-chain" 형태라 이름 정렬 = 날짜·슬롯 순
  return dirs[0] ?? null;
}

async function main() {
  const item = nextQueueItem();
  if (!item) {
    console.log('큐가 비어 있다 — 로컬에서 generate.ts 를 돌려 채워야 한다');
    return;
  }

  const dir = `queue/${item}`;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort(); // 01.png, 02.png … — 슬라이드 순서
  const caption = readFileSync(`${dir}/caption.txt`, 'utf8');

  console.log(`▶ ${item} 게시 시작 (${files.length}장)`);
  const imageUrls = files.map((f) => rawUrl(`${dir}/${f}`));

  const mediaId = await publishCarousel({
    igUserId: IG_USER_ID,
    accessToken: ACCESS_TOKEN,
    imageUrls,
    caption,
  });

  console.log(`✓ 게시 완료 — media id ${mediaId}`);

  renameSync(dir, `posted/${item}`);
  console.log(`✓ queue/${item} → posted/${item} 로 옮김`);
}

main().catch((e) => {
  console.error('✗ 게시 실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
