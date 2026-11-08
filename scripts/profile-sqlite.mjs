/** Disposable, offline SQLite profile. Never opens a user-selected library. */
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openSqliteStore} from '../src/sqlite-store.mjs';

const raw = process.argv[2] ?? '10000';
if (!/^\d{1,5}$/.test(raw) || Number(raw) < 1 || Number(raw) > 20000) {
  console.error('Usage: npm run sqlite-profile -- [1..20000] (synthetic records only)');
  process.exit(2);
}
const count = Number(raw);
const createdAt = new Date().toISOString();
const synthetic = Array.from({length:count}, (_,i) => ({
  id:`benchmark-${i}`,url:`https://example.org/benchmark/${i}`,
  title:`Synthetic benchmark ${i}`,description:'',notes:'',tags:[],
  status:'unread',favorite:false,pinned:false,trashedAt:null,collectionId:null,
  createdAt,updatedAt:createdAt
}));
const dir = await mkdtemp(join(tmpdir(),'gcb-sqlite-profile-'));
const elapsed = () => Number(process.hrtime.bigint()) / 1e6;
let store;
try {
  const start=elapsed();
  store=await openSqliteStore(join(dir,'benchmark.sqlite'));
  const ready=elapsed();
  await store.mutate(s=>{ s.bookmarks.push(...synthetic); });
  const inserted=elapsed();
  await store.mutate(s=>{ s.bookmarks[0].title='Updated synthetic benchmark'; });
  const updated=elapsed();
  const snapshot=store.snapshot();
  if(snapshot.bookmarks.length!==count || snapshot.bookmarks[0].title!=='Updated synthetic benchmark')
    throw new Error('Snapshot verification failed');
  const snapshotted=elapsed();
  await store.close();store=null;
  store=await openSqliteStore(join(dir,'benchmark.sqlite'));
  const reopened=elapsed();
  const restored=store.snapshot();
  if(restored.bookmarks.length!==count || restored.bookmarks[0].title!=='Updated synthetic benchmark')
    throw new Error('Reopen verification failed');
  console.log(JSON.stringify({syntheticRecords:count,
    timingsMilliseconds:{open:ready-start,insert:inserted-ready,
      singleEdit:updated-inserted,snapshot:snapshotted-updated,reopen:reopened-snapshotted},
    residentMemoryMB:process.memoryUsage().rss/(1024*1024)},null,2));
} finally {
  if(store) await store.close().catch(()=>{});
  await rm(dir,{recursive:true,force:true});
}
