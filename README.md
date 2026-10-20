# ⚾ 다이아몬드 듀얼

간단한 그래픽(Canvas)의 야구 게임. Vite + Vanilla JS + Supabase.

- **타격**: 우타자로 상대 투수의 공을 타이밍에 맞춰 받아치기 (SPACE / 클릭)
- **피칭**: 좌투수로 포심·슬라이더·커브·포크볼을 골라 스트라이크 존에 넣기 (구종 → 조준 → 제구 게이지)
- **프로필**: 이름, 국적(전 세계 250개 국가/지역), 포지션, 나이, 소속 팀
- **리그**: 미국 도시 이름으로 랜덤 생성된 10개 팀 + 130명의 생성 선수 (이름·성적 고정 저장)
- **기록실 / 리뷰**: 모든 성적·점수와 리뷰를 Supabase에 저장

## 실행

```bash
npm install
npm run dev
```

## Supabase 연결

1. Supabase 프로젝트를 만듭니다.
2. **SQL Editor**에서 `supabase/schema.sql` 내용을 전부 실행합니다.
3. `.env.local`에 값을 넣습니다 (**Project Settings → API**에서 확인):

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
4. `npm run dev`를 다시 시작합니다. 첫 실행 때 리그(팀·생성 선수·성적)가 한 번 시드된 뒤 고정됩니다.

`.env.local`을 비워두면 **로컬 모드**(브라우저 localStorage)로 동작합니다.

## 테이블

| 테이블 | 내용 |
|---|---|
| `teams` | 랜덤 생성 팀 (도시, 닉네임, 약어, 색상) |
| `players` | 유저 선수 + 생성 선수 (`is_generated`) |
| `player_stats` | 선수별 누적 성적. 생성 선수 성적은 시드 이후 수정 불가 |
| `game_records` | 한 판마다의 점수 기록 (랭킹) |
| `reviews` | 게임 리뷰 (작성자, 별점, 내용) |

로그인 없이 anon 키로 동작합니다. 쓰기는 `seed_league` / `record_game` RPC 함수와
`players`·`reviews` insert 정책으로만 허용됩니다.
