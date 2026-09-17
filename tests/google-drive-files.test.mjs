import test from "node:test";
import assert from "node:assert/strict";
import {listFiles} from "../scripts/google-drive-files.mjs";
const response=data=>({ok:true,status:200,text:async()=>JSON.stringify(data)});
test("Drive inventory follows empty intermediate pages and preserves exact query",async()=>{
  const seen=[];
  const result=await listFiles("synthetic","'bound-folder' in parents",async url=>{
    const u=new URL(url);seen.push(u.searchParams.get("pageToken"));
    assert.equal(u.searchParams.get("q"),"'bound-folder' in parents");
    if(seen.length===1)return response({files:[{id:"a"}],nextPageToken:"second"});
    if(seen.length===2)return response({files:[],nextPageToken:"third"});
    return response({files:[{id:"b"}]});
  });
  assert.deepEqual(result.map(f=>f.id),["a","b"]);
  assert.deepEqual(seen,[null,"second","third"]);
});
test("Drive inventory fails closed on partial search, token loops and changed pages",async()=>{
  await assert.rejects(listFiles("synthetic","query",async()=>response({files:[],incompleteSearch:true})),/LIST_INCOMPLETE/);
  await assert.rejects(listFiles("synthetic","query",async()=>response({files:[],nextPageToken:"loop"})),/LIST_INCOMPLETE/);
  await assert.rejects(listFiles("synthetic","query",async()=>response({files:[{id:"duplicate"}],nextPageToken:"next"})),/LIST_CHANGED/);
});
