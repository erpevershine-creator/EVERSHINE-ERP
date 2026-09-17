begin;
select plan(3);
select ok(not has_function_privilege('authenticated','public.complete_permanent_handover(uuid,uuid,bigint[],text)','execute'),'legacy immediate transfer is inaccessible to clients');
select ok(not has_function_privilege('service_role','public.complete_permanent_handover(uuid,uuid,bigint[],text)','execute'),'service cannot bypass review');
select throws_ok($$select public.complete_permanent_handover(null,null,null,null)$$,'P0001','Permanent handover requires an approved request','legacy implementation disabled even for privileged callers');
select * from finish();
rollback;
