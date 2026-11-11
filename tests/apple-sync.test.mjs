import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSnapshot} from '../supabase/functions/apple-sync/validate.mjs';
const now=Date.parse('2026-11-11T00:00:00Z');
const wrap=sources=>({version:1,captured_at:'2026-11-11T09:00:00+09:00',sources});
test('normalizes three sources including no deadline and all-day',()=>{
 const result=validateSnapshot(wrap({schedules:[{name:'終日',date:'2026-11-12',time:''}],shopping:[{name:'牛乳'}],tasks:[{name:'掃除',date:''}]}),now);
 assert.equal(result.sources.shopping[0].done,false);
 assert.equal(result.sources.tasks[0].date,'');
 assert.equal(result.captured_at,'2026-11-11T00:00:00.000Z');
});
test('explicit empty list stays empty and absent source stays absent',()=>{
 const result=validateSnapshot(wrap({shopping:[]}),now);
 assert.deepEqual(result.sources,{shopping:[]});
});
test('rejects malformed input before it can erase a snapshot',()=>{
 for(const sources of [{shopping:''},{shopping:[{}]},{shopping:[{name:'x',done:'false'}]},{unexpected:[]},{schedules:[{name:'x',date:'2026-02-30'}]},{schedules:[{name:'x',date:'2026-11-12',time:'25:00'}]},{schedules:[{name:'x'}]},{}]){
  assert.throws(()=>validateSnapshot(wrap(sources),now));
 }
});
test('rejects unbounded or stale submissions',()=>{
 assert.throws(()=>validateSnapshot(wrap({shopping:Array.from({length:2001},()=>({name:'x'}))}),now));
 assert.throws(()=>validateSnapshot({...wrap({shopping:[]}),captured_at:'2026-11-08T00:00:00Z'},now));
 assert.throws(()=>validateSnapshot({...wrap({shopping:[]}),captured_at:'2026-11-12T00:00:00Z'},now));
 assert.throws(()=>validateSnapshot({...wrap({shopping:[]}),captured_at:'2026-11-11T09:00:00'},now));
});
test('keeps text as data, including quotes and markup',()=>{
 const name='<script>"quoted" & text</script>';
 assert.equal(validateSnapshot(wrap({shopping:[{name}]}),now).sources.shopping[0].name,name);
});
