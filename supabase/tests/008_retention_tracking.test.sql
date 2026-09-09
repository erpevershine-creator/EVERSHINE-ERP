begin;
select plan(4);
select ok(not has_column_privilege('authenticated','public.local_backup_runs','archive_state','update'),'clients cannot mark archives removed');
select ok(not has_column_privilege('authenticated','public.local_backup_runs','prune_replacement_id','update'),'clients cannot substitute a replacement');
-- All identities and archive metadata are transaction-only fixtures.
create temporary table rt(employee uuid, manual uuid, scheduled uuid, replacement uuid);
insert into rt values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
insert into auth.users(id,email,role,aud) select employee,'retention.fixture@gmail.com','authenticated','authenticated' from rt;
insert into public.profiles(id,employee_name,company_position,position_id,department,erp_role,username,contact,avatar_path)
select employee,'Retention Fixture','Test Position',(select id from public.positions where erp_role_code='sales'),'Test','sales','retention.fixture@gmail.com','test',employee||'/photo.png' from rt;
insert into public.local_backup_runs(id,requester_id,reason,status,finished_at)
select manual,employee,'Retention fixture','verified',now() from rt;
insert into public.local_backup_runs(id,origin,scheduled_for,reason,status,finished_at)
select scheduled,'scheduled',date '1900-01-01','Retention fixture','verified',now() from rt
union all select replacement,'scheduled',date '1900-01-02','Replacement fixture','verified',now() from rt;
select throws_ok($$update public.local_backup_runs set archive_state='pruning',prune_replacement_id=(select replacement from rt) where id=(select manual from rt)$$,'23514','new row for relation "local_backup_runs" violates check constraint "only_scheduled_archives_pruned"','manual archive cannot enter removal');
select throws_ok($$update public.local_backup_runs set archive_state='pruned',prune_replacement_id=(select replacement from rt) where id=(select scheduled from rt)$$,'23514','new row for relation "local_backup_runs" violates check constraint "pruned_timestamp_matches"','removed archive requires a removal timestamp');
select finish();
rollback;
