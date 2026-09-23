# lumiya-poster

kantsuna(かんつな) 카드뉴스를 인스타그램에 하루 3번 자동 게시하는 저장소.
원본 소스·데이터(03_KDK)와 **분리**되어 있다 — 여기 올라오는 건 완성된 광고
이미지·캡션뿐이다. 전체 배경은 03_KDK 저장소의 `docs/cardnews-rules.md` 참조.

## 이 저장소를 왜 public 으로 두는가

인스타그램 Graph API는 이미지를 올릴 때 **공개적으로 접근 가능한 URL**을 요구한다
(Meta 서버가 그 주소로 직접 이미지를 가져간다). 이 저장소를 public 으로 두면
`raw.githubusercontent.com/.../queue/.../01.png` 링크가 바로 공개 URL이 되어,
별도의 이미지 호스팅 서비스 없이 그대로 쓸 수 있다.

private 로 두고 싶을 수도 있지만, 어차피 이 이미지들은 **몇 시간 안에 인스타그램에
공개로 올라갈 것들**이라 저장소가 public 이어서 생기는 추가 노출은 없다. 코드
(`post.ts` 등)에는 시크릿이 전혀 없다 — 토큰은 전부 GitHub Secrets 에 있다.

## 처음 설정할 때 (사람이 직접 해야 하는 것)

### 1. 인스타그램 쪽

1. 인스타그램 계정을 **프로페셔널(비즈니스 또는 크리에이터)** 계정으로 전환한다
   (앱 설정 → 계정 전환).
2. 페이스북 페이지를 하나 만들고, 그 인스타그램 계정과 연결한다.

### 2. Meta 개발자 앱

1. https://developers.facebook.com 에서 앱을 하나 만든다(유형: 비즈니스).
2. "Instagram Graph API" 제품을 추가한다.
3. 본인 인스타그램 계정을 그 앱의 **테스터**로 등록한다 — 본인 계정에만 쓸
   거면 이 단계로 충분하고, Meta 의 앱 심사(App Review)는 **필요 없다**.
4. Graph API Explorer(https://developers.facebook.com/tools/explorer/) 에서
   이 앱을 선택하고, `instagram_business_content_publish` 권한으로 사용자
   액세스 토큰을 하나 받는다. 이걸 장기 토큰(60일)으로 바꾼다(Explorer 의
   "토큰 디버거"나 `fb_exchange_token` 요청으로).
5. 같은 Explorer 로 `GET /me/accounts` → 연결된 페이지 id 확인 →
   `GET /{페이지id}?fields=instagram_business_account` 로 **IG_USER_ID**(인스타그램
   비즈니스 계정 id, 숫자)를 얻는다.

### 3. 이 저장소를 GitHub 에 올리기

```bash
cd lumiya-poster
git add -A
git commit -m "init"
# GitHub 에서 새 저장소(public)를 만든 뒤:
git remote add origin https://github.com/<본인계정>/lumiya-poster.git
git branch -M main
git push -u origin main
```

### 4. 저장소 Secrets 설정 (Settings → Secrets and variables → Actions)

| 이름 | 값 | 필수 |
|---|---|---|
| `IG_USER_ID` | 위에서 얻은 인스타그램 비즈니스 계정 id | 필수 |
| `IG_ACCESS_TOKEN` | 장기 액세스 토큰 | 필수 |
| `META_APP_ID` | Meta 개발자 앱의 App ID | 토큰 자동 갱신 쓸 거면 필요 |
| `META_APP_SECRET` | Meta 개발자 앱의 App Secret | 위와 같음 |
| `GH_PAT` | repo 시크릿을 고칠 수 있는 개인 액세스 토큰 | 토큰 자동 갱신 쓸 거면 필요, 없어도 게시 자체는 된다 |

`GH_PAT`이 없어도 하루 3번 게시는 정상 작동한다 — 다만 60일마다 `IG_ACCESS_TOKEN`을
**수동으로** 다시 받아 넣어야 한다(`refresh-token.yml`이 실패 로그에 새 토큰 값을
남기니 그걸 복사해도 되고, 2번 단계를 다시 밟아도 된다).

## 어떻게 돌아가는가

```
03_KDK (로컬)                          lumiya-poster (GitHub, public)
  generate.ts 실행                       queue/2026-09-24-slot1-chain/
    → 이미지+캡션 생성                        01.png … caption.txt
    → 여기 queue/ 에 복사 + git push  ───▶
                                        (스케줄) post.yml 이 3번 돈다
                                          → queue 의 가장 오래된 것 게시
                                          → 성공하면 posted/ 로 이동 + 커밋
```

큐가 마르면(= `queue/`가 비면) `post.yml`은 그냥 "큐가 비어 있다"고 로그만 남기고
넘어간다 — 03_KDK 에서 `generate.ts`를 다시 돌려 채워 넣어야 한다.

## 로컬에서 테스트

```bash
npm install
IG_USER_ID=... IG_ACCESS_TOKEN=... REPO_FALLBACK=owner/lumiya-poster npm run post
```

실제 Meta API를 호출하므로 큐에 진짜로 올려도 되는 항목이 있을 때만 돌린다.
GitHub Actions 쪽은 저장소의 "Actions" 탭에서 `workflow_dispatch`로 수동 실행해
먼저 확인해보는 걸 추천한다(스케줄을 기다리지 않아도 됨).
