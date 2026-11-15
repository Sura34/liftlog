-- Hypertrophy-oriented 3-day LiftLog program.
-- Keeps the existing exercise IDs and all personal workout history untouched.
insert into public.exercises (id,name,muscle_group,unit,demo_query)
values ('leg-curl','Seated leg curl','Hamstrings','reps','seated leg curl correct form')
on conflict (id) do update
set name=excluded.name,muscle_group=excluded.muscle_group,unit=excluded.unit,demo_query=excluded.demo_query;

update public.workout_templates set name='Full body A · Squat and push' where id='A';
update public.workout_templates set name='Full body B · Pull and legs' where id='B';
update public.workout_templates set name='Full body C · Hinge and upper body' where id='C';

-- Template data is shared, not personal history.
delete from public.template_exercises where template_id in ('A','B','C');

insert into public.template_exercises
(template_id,exercise_id,sort_order,sets,rep_min,rep_max,rest_seconds,tag) values
('A','squat',1,3,6,10,150,null),
('A','db-bench',2,3,8,12,120,null),
('A','cable-row',3,3,8,12,90,null),
('A','rdl',4,3,8,10,120,null),
('A','lateral',5,2,12,20,0,'5a'),
('A','pushdown',6,2,10,15,60,'5b'),

('B','pulldown',1,3,8,12,120,null),
('B','leg-press',2,3,10,15,120,null),
('B','db-bench',3,2,8,12,90,null),
('B','shoulder-press',4,2,8,12,90,null),
('B','leg-curl',5,3,10,15,75,null),
('B','curl',6,2,10,15,0,'6a'),
('B','face-pull',7,2,12,20,60,'6b'),

('C','deadlift',1,2,5,8,150,null),
('C','incline-press',2,3,8,12,120,null),
('C','one-row',3,3,8,12,90,null),
('C','lunges',4,2,8,12,90,null),
('C','hip-thrust',5,2,8,12,90,null),
('C','lateral',6,2,12,20,0,'6a'),
('C','overhead-triceps',7,2,10,15,60,'6b');