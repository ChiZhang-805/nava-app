import test from 'node:test';
import assert from 'node:assert/strict';
import {collectExportRows,exportOrderColumn} from '../supabase/functions/_shared/export-pagination.ts';
import {collectMiyouExport,miyouExportTables} from '../supabase/functions/_shared/miyou-export.ts';
test('export reads beyond a server row cap without skipping rows',async()=>{
 const data=Array.from({length:1234},(_,id)=>({id}));
 const rows=await collectExportRows(async(from,to)=>({data:data.slice(from,Math.min(to+1,from+100)),count:data.length,error:null}));
 assert.deepEqual(rows,data);
});
test('empty exports finish and incomplete or changing exports fail',async()=>{
 assert.deepEqual(await collectExportRows(async()=>({data:[],count:0,error:null})),[]);
 await assert.rejects(collectExportRows(async()=>({data:[],count:2,error:null})),/incomplete/);
 await assert.rejects(collectExportRows(async()=>({data:[],count:null,error:null})),/count unavailable/);
 let call=0;
 await assert.rejects(collectExportRows(async()=>({data:[1],count:++call===1?2:3,error:null})),/changed/);
 await assert.rejects(collectExportRows(async()=>({data:null,count:null,error:new Error('offline')})),/offline/);
});
test('composite keys sort by their varying account-scoped column',()=>{
 assert.equal(exportOrderColumn('active_user_sessions'),'session_type');
 assert.equal(exportOrderColumn('reward_cart_items'),'product_id');
 assert.equal(exportOrderColumn('user_notifications'),'id');
});
test('Miyou export collects all six account scopes and follows RPC pagination',async()=>{
 const messages=Array.from({length:620},(_,id)=>({id}));
 const result=await collectMiyouExport(async(kind,offset)=>{
  const rows=kind==='miyou_messages'?messages:[];
  return {data:{rows:rows.slice(offset,offset+500),total:rows.length},error:null};
 });
 assert.deepEqual(Object.keys(result),[...miyouExportTables]);
 assert.deepEqual(result.miyou_messages,messages);
 await assert.rejects(collectMiyouExport(async()=>({data:null,error:new Error('rpc unavailable')})),/rpc unavailable/);
});
