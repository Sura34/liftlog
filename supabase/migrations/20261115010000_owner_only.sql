-- Permit LiftLog private records only for the existing owner account.
-- Public exercise catalog remains readable by anyone; private data does not.
drop policy if exists "own workout sessions" on public.sessions;
drop policy if exists "own completed sets" on public.sets;
drop policy if exists "own body measurements" on public.body_metrics;
create policy "only LiftLog owner sessions" on public.sessions
  for all to authenticated
  using (user_id = (select auth.uid()) and (select auth.uid()) = 'f4af14df-4b07-4f51-aeae-1a07039ff938'::uuid)
  with check (user_id = (select auth.uid()) and (select auth.uid()) = 'f4af14df-4b07-4f51-aeae-1a07039ff938'::uuid);
create policy "only LiftLog owner sets" on public.sets
  for all to authenticated
  using (user_id = (select auth.uid()) and (select auth.uid()) = 'f4af14df-4b07-4f51-aeae-1a07039ff938'::uuid
    and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid())))
  with check (user_id = (select auth.uid()) and (select auth.uid()) = 'f4af14df-4b07-4f51-aeae-1a07039ff938'::uuid
    and exists (select 1 from public.sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "only LiftLog owner measurements" on public.body_metrics
  for all to authenticated
  using (user_id = (select auth.uid()) and (select auth.uid()) = 'f4af14df-4b07-4f51-aeae-1a07039ff938'::uuid)
  with check (user_id = (select auth.uid()) and (select auth.uid()) = 'f4af14df-4b07-4f51-aeae-1a07039ff938'::uuid);