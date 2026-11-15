-- LiftLog private Postgres schema. Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table public.exercises (
  id text primary key,
  name text not null,
  muscle_group text not null,
  unit text not null default 'reps' check (unit in ('reps','m')),
  demo_query text not null
);
create table public.workout_templates (
  id text primary key,
  name text not null
);
create table public.template_exercises (
  template_id text not null references public.workout_templates(id),
  exercise_id text not null references public.exercises(id),
  sort_order int not null,
  sets int not null,
  rep_min int not null,
  rep_max int not null,
  rest_seconds int not null,
  tag text,
  primary key(template_id,exercise_id)
);
create table public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  template text not null check (template in ('A','B','C')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  finisher_done boolean not null default false,
  notes text not null default ''
);
create table public.sets (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  exercise_id text not null references public.exercises(id),
  set_no int not null check (set_no between 1 and 20),
  weight_kg numeric(8,2) not null default 0 check (weight_kg >= 0),
  reps int not null check (reps >= 0),
  done boolean not null default true
);
create table public.body_metrics (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  measured_at date not null,
  weight_kg numeric(6,2) check (weight_kg > 0),
  waist_cm numeric(6,2) check (waist_cm > 0)
);
create index sessions_by_user on public.sessions(user_id,finished_at desc);
create index sets_by_user_exercise on public.sets(user_id,exercise_id);
create index metrics_by_user on public.body_metrics(user_id,measured_at);

-- All private tables enforce ownership through RLS, not client-side filters.
alter table public.exercises enable row level security;
alter table public.workout_templates enable row level security;
alter table public.template_exercises enable row level security;
alter table public.sessions enable row level security;
alter table public.sets enable row level security;
alter table public.body_metrics enable row level security;

create policy "read catalog" on public.exercises for select to anon,authenticated using (true);
create policy "read templates" on public.workout_templates for select to anon,authenticated using (true);
create policy "read template exercises" on public.template_exercises for select to anon,authenticated using (true);
create policy "own workout sessions" on public.sessions
 for all to authenticated
 using (user_id=(select auth.uid()))
 with check (user_id=(select auth.uid()));
create policy "own completed sets" on public.sets
 for all to authenticated
 using (user_id=(select auth.uid()) and exists
   (select 1 from public.sessions s where s.id=session_id and s.user_id=(select auth.uid())))
 with check (user_id=(select auth.uid()) and exists
   (select 1 from public.sessions s where s.id=session_id and s.user_id=(select auth.uid())));
create policy "own body measurements" on public.body_metrics
 for all to authenticated
 using (user_id=(select auth.uid()))
 with check (user_id=(select auth.uid()));

create or replace view public.exercise_history with (security_invoker=true) as
 select s.user_id,t.exercise_id,s.id as session_id,s.finished_at,
        max(t.weight_kg) as top_weight_kg,
        max(t.weight_kg*(1+t.reps/30.0)) as estimated_1rm,
        sum(t.weight_kg*t.reps) as total_volume
 from public.sessions s join public.sets t on t.session_id=s.id
 where t.done group by s.user_id,t.exercise_id,s.id,s.finished_at;

insert into public.workout_templates(id,name) values
 ('A','Squat + push'),('B','Pull + legs'),('C','Hinge + arms');

insert into public.exercises(id,name,muscle_group,unit,demo_query) values
 ('squat','Barbell back squat','Quads','reps','barbell back squat form'),
 ('db-bench','Dumbbell bench press','Chest','reps','dumbbell bench press form'),
 ('cable-row','Seated cable row','Back','reps','seated cable row form'),
 ('rdl','Romanian deadlift','Hamstrings','reps','romanian deadlift form'),
 ('lateral','Dumbbell lateral raise','Shoulders','reps','dumbbell lateral raise form'),
 ('pushdown','Cable triceps pushdown','Triceps','reps','triceps pushdown form'),
 ('pulldown','Lat pulldown','Back','reps','lat pulldown form'),
 ('leg-press','Leg press','Quads','reps','leg press form'),
 ('shoulder-press','Seated dumbbell shoulder press','Shoulders','reps','shoulder press form'),
 ('lunges','Dumbbell walking lunges','Legs','reps','walking lunges form'),
 ('curl','Dumbbell biceps curl','Biceps','reps','biceps curl form'),
 ('face-pull','Cable face pull','Rear delts','reps','face pull form'),
 ('knee-raise','Hanging knee raise','Core','reps','hanging knee raise form'),
 ('deadlift','Trap bar deadlift','Full body','reps','trap bar deadlift form'),
 ('incline-press','Incline dumbbell press','Chest','reps','incline dumbbell press form'),
 ('one-row','Single-arm dumbbell row','Back','reps','single arm dumbbell row form'),
 ('hip-thrust','Hip thrust','Glutes','reps','hip thrust form'),
 ('overhead-triceps','Overhead triceps extension','Triceps','reps','overhead triceps form'),
 ('farmers','Farmer''s carry','Grip and core','m','farmers carry form');

insert into public.template_exercises
 (template_id,exercise_id,sort_order,sets,rep_min,rep_max,rest_seconds,tag) values
 ('A','squat',1,3,6,8,180,null),
 ('A','db-bench',2,3,8,10,120,null),
 ('A','cable-row',3,3,10,12,90,null),
 ('A','rdl',4,3,8,10,120,null),
 ('A','lateral',5,3,12,15,0,'5a'),
 ('A','pushdown',6,3,10,15,60,'5b'),
 ('B','pulldown',1,3,8,12,120,null),
 ('B','leg-press',2,3,10,12,120,null),
 ('B','shoulder-press',3,3,8,10,120,null),
 ('B','lunges',4,3,10,10,90,null),
 ('B','curl',5,3,10,12,0,'5a'),
 ('B','face-pull',6,3,12,15,60,'5b'),
 ('B','knee-raise',7,3,10,15,60,null),
 ('C','deadlift',1,3,5,8,180,null),
 ('C','incline-press',2,3,8,12,120,null),
 ('C','one-row',3,3,10,10,90,null),
 ('C','hip-thrust',4,3,8,12,90,null),
 ('C','lateral',5,3,12,15,0,'5a'),
 ('C','overhead-triceps',6,3,10,12,60,'5b'),
 ('C','farmers',7,3,30,40,60,null);
