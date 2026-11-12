/**
 * 게시 시각 관문 — 「지금 올릴 차례인가」를 GitHub 의 예약 실행에 맡기지 않고 직접 판정한다.
 *
 * ## 왜
 * 2026-11-12: 06:04 에 카드뉴스 6개를 큐에 넣었는데 07:30 회차가 **아예 실행되지 않았고**, 10:30 릴스 회차도 11 시가 넘도록
 * 뜨지 않았다. GitHub 의 schedule 은 부하가 몰리면 늦거나 **건너뛴다**(공식 문서). 회차마다 cron 하나라 한 번 빠지면 그 글은
 * 다음 회차로 밀리고, 하루 끝 회차가 빠지면 하루가 통째로 빈다.
 *
 * ## 어떻게
 * 워크플로는 20분마다 돈다. 매번 「오늘(JST) 지난 회차 중 가장 늦은 것」을 보고, 그 회차에 아직 안 올렸으면 **하나만** 올린다.
 * 그보다 이른 회차를 놓쳤으면 따라잡지 않고 건너뛴 것으로 적는다 — 몇 시간 끊겼다가 돌아온 순간 서너 개를 연달아
 * 올리면 팔로워 피드가 도배되고 직전 글의 도달을 스스로 깎는다(post.yml 머리 주석의 하루 3회 근거).
 * 수동 실행(workflow_dispatch)은 관문을 건너뛴다 — 사람이 누른 것은 「지금 올려라」다.
 *
 * 기록은 `<kind>-slots.json`(커밋된다). 카드뉴스와 릴스가 같은 파일을 쓰면 두 워크플로가 동시에 push 하다 충돌한다.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

type Log = Record<string, 'posted' | 'skipped'>;

/** JST 의 날짜(YYYY-MM-DD)와 분(0~1439) */
function jstNow(now = new Date()): { date: string; minutes: number } {
  const j = new Date(now.getTime() + 9 * 3600_000);
  return { date: j.toISOString().slice(0, 10), minutes: j.getUTCHours() * 60 + j.getUTCMinutes() };
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export interface Gate {
  /** 이번 실행이 채울 회차 키(예: '2026-11-12 10:30'). null 이면 올릴 차례가 아니다 */
  slot: string | null;
  reason: string;
  /** 올렸으면 부른다 — 이 회차를 posted 로, 그보다 이른 미기록 회차를 skipped 로 적는다 */
  markPosted: () => void;
}

export function slotGate(kind: 'cards' | 'reels', slots: string[], now = new Date()): Gate {
  const file = `${kind}-slots.json`;
  const log: Log = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const { date, minutes } = jstNow(now);
  const due = slots.filter((s) => toMin(s) <= minutes).sort();
  const save = () => {
    // 오래된 기록은 2주만 남긴다 — 커밋마다 파일이 자라지 않게
    const cutoff = new Date(now.getTime() - 14 * 86400_000).toISOString().slice(0, 10);
    for (const k of Object.keys(log)) if (k.slice(0, 10) < cutoff) delete log[k];
    writeFileSync(file, JSON.stringify(log, null, 2) + '\n');
  };
  const markFor = (key: string) => () => {
    for (const s of due) {
      const k = `${date} ${s}`;
      if (k !== key && !log[k]) log[k] = 'skipped';
    }
    log[key] = 'posted';
    save();
  };

  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    const key = `${date} manual-${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    return { slot: key, reason: '수동 실행 — 관문을 건너뛴다', markPosted: markFor(key) };
  }
  const latest = due.at(-1);
  if (!latest) return { slot: null, reason: `오늘(${date}) 첫 회차(${slots[0]} JST) 전`, markPosted: () => {} };
  const key = `${date} ${latest}`;
  if (log[key]) return { slot: null, reason: `${key} JST 회차는 이미 처리(${log[key]})`, markPosted: () => {} };
  return { slot: key, reason: `${key} JST 회차가 비어 있다 — 올린다`, markPosted: markFor(key) };
}
