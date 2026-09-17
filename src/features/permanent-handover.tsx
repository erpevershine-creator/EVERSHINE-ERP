"use client";
import {useActionState,useState} from "react";
import {getPermanentHandoverOptions,requestPermanentHandover,type Result} from "@/app/live/actions";

type Options=Awaited<ReturnType<typeof getPermanentHandoverOptions>>;
export function PermanentHandover({source,version}:{source:string;version:number}) {
  const [options,setOptions]=useState<Options|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [successor,setSuccessor]=useState("");
  const [state,submit,pending]=useActionState(async (_:Result,form:FormData)=>requestPermanentHandover(form),{status:"idle",message:""} as Result);
  return <details><summary>Permanent successor handover</summary>
    <p>Owner reviews the transferred role and Company Position, merged individual permissions, and selected unfinished approvals. The old account becomes inactive after approval. Both accounts must sign in again.</p>
    <button type="button" disabled={loading||pending} onClick={async()=>{
      setLoading(true);setError("");setOptions(null);setSuccessor("");
      try {setOptions(await getPermanentHandoverOptions(source));}
      catch {setError("Unable to load the complete handover review list.");}
      finally {setLoading(false);}
    }}>{loading?"Loading…":"Load handover options"}</button>
    {error&&<p role="alert">{error}</p>}
    {options&&<form action={submit}>
      <input type="hidden" name="source" value={source}/><input type="hidden" name="sourceVersion" value={version}/>
      <input type="hidden" name="successorVersion" value={options.people.find(p=>p.id===successor)?.version??""}/>
      <label>Successor<select name="successor" required value={successor} onChange={e=>setSuccessor(e.target.value)}><option value="">Select employee</option>{options.people.map(p=><option key={p.id} value={p.id}>{p.employee_name} ({p.erp_role})</option>)}</select></label>
      <fieldset><legend>Select unfinished approvals to transfer</legend>
      {options.items.map(item=><label key={item.id}><input type="checkbox" name="item" value={item.id}/>{item.module}: {item.reason}</label>)}
      {!options.items.length&&<p>No pending approvals for this account.</p>}</fieldset>
      <label>Reason<textarea name="reason" required maxLength={1000}/></label>
      <button type="submit" disabled={pending||!successor}>{pending?"Submitting…":"Request Owner handover review"}</button>
      {state.message&&<p role={state.status==="error"?"alert":"status"}>{state.message}</p>}
    </form>}
  </details>;
}
