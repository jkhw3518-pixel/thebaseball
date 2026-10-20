-- =====================================================================
-- 다이아몬드 듀얼 - Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행하세요.
-- 로그인 없이 anon 키로 동작하도록 RLS 정책이 설정되어 있습니다.
-- =====================================================================

create extension if not exists pgcrypto;

-- 팀 (미국 도시 기반 랜덤 생성, 최초 1회 시드 후 고정)
create table if not exists public.teams (
  id          text primary key,
  city        text not null,
  nickname    text not null,
  abbr        text not null,
  color       text not null,
  created_at  timestamptz not null default now()
);

-- 선수 (유저가 만든 선수 + 자동 생성 선수)
create table if not exists public.players (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 40),
  nationality   text not null check (char_length(nationality) between 2 and 3), -- ISO 3166-1 alpha-2
  position      text not null,
  age           int  not null check (age between 15 and 60),
  team_id       text references public.teams(id) on delete set null,
  bats          text not null default 'R',
  throws        text not null default 'L',
  is_generated  boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists players_team_idx on public.players(team_id);
create index if not exists players_generated_idx on public.players(is_generated);

-- 누적 성적 (선수 1명당 1행)
create table if not exists public.player_stats (
  player_id           uuid primary key references public.players(id) on delete cascade,
  games               int not null default 0,
  -- 타격
  plate_appearances   int not null default 0,
  at_bats             int not null default 0,
  hits                int not null default 0,
  doubles             int not null default 0,
  triples             int not null default 0,
  home_runs           int not null default 0,
  rbi                 int not null default 0,
  walks               int not null default 0,
  strikeouts          int not null default 0,
  -- 투구
  outs_recorded       int not null default 0,
  pitches             int not null default 0,
  strikes_thrown      int not null default 0,
  pitcher_strikeouts  int not null default 0,
  walks_allowed       int not null default 0,
  hits_allowed        int not null default 0,
  runs_allowed        int not null default 0,
  wins                int not null default 0,
  losses              int not null default 0,
  -- 게임 점수
  best_batting_score  int not null default 0,
  best_pitching_score int not null default 0,
  total_score         bigint not null default 0,
  updated_at          timestamptz not null default now()
);

-- 한 판 단위 게임 기록 (점수 랭킹)
create table if not exists public.game_records (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid not null references public.players(id) on delete cascade,
  mode              text not null check (mode in ('batting', 'pitching')),
  score             int  not null check (score between 0 and 100000),
  opponent_team_id  text references public.teams(id) on delete set null,
  details           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists game_records_mode_score_idx on public.game_records(mode, score desc);

-- 게임 리뷰
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid references public.players(id) on delete set null,
  author_name  text not null check (char_length(author_name) between 1 and 40),
  rating       int  not null check (rating between 1 and 5),
  content      text not null check (char_length(content) between 1 and 1000),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS: 읽기는 모두 허용, 쓰기는 꼭 필요한 것만 허용
-- 생성 선수의 성적은 아래 함수(seed_league)로만 1회 기록되고 이후 변경 불가
-- ---------------------------------------------------------------------
alter table public.teams        enable row level security;
alter table public.players      enable row level security;
alter table public.player_stats enable row level security;
alter table public.game_records enable row level security;
alter table public.reviews      enable row level security;

drop policy if exists "teams read"        on public.teams;
drop policy if exists "players read"      on public.players;
drop policy if exists "players insert"    on public.players;
drop policy if exists "stats read"        on public.player_stats;
drop policy if exists "records read"      on public.game_records;
drop policy if exists "reviews read"      on public.reviews;
drop policy if exists "reviews insert"    on public.reviews;

create policy "teams read"     on public.teams        for select using (true);
create policy "players read"   on public.players      for select using (true);
create policy "players insert" on public.players      for insert with check (is_generated = false);
create policy "stats read"     on public.player_stats for select using (true);
create policy "records read"   on public.game_records for select using (true);
create policy "reviews read"   on public.reviews      for select using (true);
create policy "reviews insert" on public.reviews      for insert with check (true);

-- ---------------------------------------------------------------------
-- 리그 시드: 팀/생성선수/생성선수 성적을 한 번만 기록 (동시 호출 대비 락)
-- ---------------------------------------------------------------------
create or replace function public.seed_league(p_teams jsonb, p_players jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r     jsonb;
  s     jsonb;
  v_pid uuid;
begin
  perform pg_advisory_xact_lock(770123);
  if exists (select 1 from teams) then
    return false;
  end if;

  insert into teams (id, city, nickname, abbr, color)
  select x->>'id', x->>'city', x->>'nickname', x->>'abbr', x->>'color'
  from jsonb_array_elements(p_teams) as x;

  for r in select * from jsonb_array_elements(p_players) loop
    insert into players (name, nationality, position, age, team_id, bats, throws, is_generated)
    values (r->>'name', r->>'nationality', r->>'position', (r->>'age')::int,
            r->>'team_id', coalesce(r->>'bats', 'R'), coalesce(r->>'throws', 'R'), true)
    returning id into v_pid;

    s := coalesce(r->'stats', '{}'::jsonb);
    insert into player_stats (
      player_id, games, plate_appearances, at_bats, hits, doubles, triples, home_runs, rbi, walks, strikeouts,
      outs_recorded, pitches, strikes_thrown, pitcher_strikeouts, walks_allowed, hits_allowed, runs_allowed, wins, losses
    ) values (
      v_pid,
      coalesce((s->>'games')::int, 0),
      coalesce((s->>'plate_appearances')::int, 0),
      coalesce((s->>'at_bats')::int, 0),
      coalesce((s->>'hits')::int, 0),
      coalesce((s->>'doubles')::int, 0),
      coalesce((s->>'triples')::int, 0),
      coalesce((s->>'home_runs')::int, 0),
      coalesce((s->>'rbi')::int, 0),
      coalesce((s->>'walks')::int, 0),
      coalesce((s->>'strikeouts')::int, 0),
      coalesce((s->>'outs_recorded')::int, 0),
      coalesce((s->>'pitches')::int, 0),
      coalesce((s->>'strikes_thrown')::int, 0),
      coalesce((s->>'pitcher_strikeouts')::int, 0),
      coalesce((s->>'walks_allowed')::int, 0),
      coalesce((s->>'hits_allowed')::int, 0),
      coalesce((s->>'runs_allowed')::int, 0),
      coalesce((s->>'wins')::int, 0),
      coalesce((s->>'losses')::int, 0)
    );
  end loop;

  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 게임 결과 기록: game_records 추가 + player_stats 누적 (유저 선수만)
-- ---------------------------------------------------------------------
create or replace function public.record_game(
  p_player_id uuid,
  p_mode text,
  p_score int,
  p_opponent_team_id text,
  p_details jsonb,
  p_delta jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gen boolean;
  v_id  uuid;
  d     jsonb := coalesce(p_delta, '{}'::jsonb);
begin
  select is_generated into v_gen from players where id = p_player_id;
  if v_gen is null then
    raise exception 'player not found';
  end if;
  if v_gen then
    raise exception 'generated player stats are fixed';
  end if;
  if p_mode not in ('batting', 'pitching') then
    raise exception 'invalid mode';
  end if;

  insert into game_records (player_id, mode, score, opponent_team_id, details)
  values (p_player_id, p_mode, greatest(0, least(p_score, 100000)), p_opponent_team_id, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;

  insert into player_stats (player_id) values (p_player_id) on conflict (player_id) do nothing;

  update player_stats set
    games               = games + 1,
    plate_appearances   = plate_appearances   + coalesce((d->>'plate_appearances')::int, 0),
    at_bats             = at_bats             + coalesce((d->>'at_bats')::int, 0),
    hits                = hits                + coalesce((d->>'hits')::int, 0),
    doubles             = doubles             + coalesce((d->>'doubles')::int, 0),
    triples             = triples             + coalesce((d->>'triples')::int, 0),
    home_runs           = home_runs           + coalesce((d->>'home_runs')::int, 0),
    rbi                 = rbi                 + coalesce((d->>'rbi')::int, 0),
    walks               = walks               + coalesce((d->>'walks')::int, 0),
    strikeouts          = strikeouts          + coalesce((d->>'strikeouts')::int, 0),
    outs_recorded       = outs_recorded       + coalesce((d->>'outs_recorded')::int, 0),
    pitches             = pitches             + coalesce((d->>'pitches')::int, 0),
    strikes_thrown      = strikes_thrown      + coalesce((d->>'strikes_thrown')::int, 0),
    pitcher_strikeouts  = pitcher_strikeouts  + coalesce((d->>'pitcher_strikeouts')::int, 0),
    walks_allowed       = walks_allowed       + coalesce((d->>'walks_allowed')::int, 0),
    hits_allowed        = hits_allowed        + coalesce((d->>'hits_allowed')::int, 0),
    runs_allowed        = runs_allowed        + coalesce((d->>'runs_allowed')::int, 0),
    wins                = wins                + coalesce((d->>'wins')::int, 0),
    losses              = losses              + coalesce((d->>'losses')::int, 0),
    best_batting_score  = case when p_mode = 'batting'  then greatest(best_batting_score, p_score)  else best_batting_score end,
    best_pitching_score = case when p_mode = 'pitching' then greatest(best_pitching_score, p_score) else best_pitching_score end,
    total_score         = total_score + greatest(0, p_score),
    updated_at          = now()
  where player_id = p_player_id;

  return v_id;
end;
$$;

grant execute on function public.seed_league(jsonb, jsonb) to anon, authenticated;
grant execute on function public.record_game(uuid, text, int, text, jsonb, jsonb) to anon, authenticated;
