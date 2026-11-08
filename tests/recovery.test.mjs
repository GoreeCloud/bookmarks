import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from '../src/store.mjs';
import {makeCollection,makeBookmark} from '../src/core.mjs';
import {backupLibrary,restoreBackup} from '../src/backup.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
test('restored library starts as a separate server and preserves saved content over HTTP', {timeout:15000},async()=>{
  const temp=await mkdtemp(join(tmpdir(),'gcb-recovery-e2e-'));
  let child;
  try{
    const source=join(temp,'original.json');
    const store=await openStore(source);
    const shelf=makeCollection({name:'Family research'});
    const original=makeBookmark({url:'https://example.org/keep',title:'Preserved document',notes:'Keep forever',tags:['research'],collectionId:shelf.id},null,[shelf]);
    await store.mutate(state=>{state.collections.push(shelf);state.bookmarks.push(original);});
    const backup=await backupLibrary(source,join(temp,'backup'));
    const recovered=join(temp,'recovered','fresh.json');
    await restoreBackup(backup.target,recovered);
    const secret='recovery-e2e-'+('g'.repeat(45));
    child=spawn(process.execPath,[join(root,'src/server.mjs')],{
      cwd:temp,
      env:{...process.env,GCB_AUTH_TOKEN:secret,GCB_DATA_FILE:recovered,HOST:'127.0.0.1',PORT:'0'},
      stdio:['ignore','pipe','pipe']
    });
    const base=await new Promise((done,fail)=>{
      const timeout=setTimeout(()=>fail(new Error('Recovery startup timed out')),6000);
      child.once('error',err=>{clearTimeout(timeout);fail(err);});
      child.once('exit',code=>{clearTimeout(timeout);fail(new Error('Recovery server exited '+code));});
      child.stdout.on('data',chunk=>{
        const m=String(chunk).match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if(m){clearTimeout(timeout);done('http://127.0.0.1:'+m[1]);}
      });
    });
    const res=await fetch(base+'/api/library',{headers:{Authorization:'Bearer '+secret}});
    assert.equal(res.status,200);
    const data=await res.json();
    assert.equal(data.schema,1);
    assert.deepEqual(data.collections,[shelf]);
    assert.equal(data.bookmarks.length,1);
    assert.deepEqual(data.bookmarks[0],original);
    const searched=await fetch(base+'/api/bookmarks?q=preserved',{headers:{Authorization:'Bearer '+secret}});
    assert.equal(searched.status,200);
    assert.equal((await searched.json()).total,1);
  }finally{
    if(child){child.kill('SIGTERM');if(child.exitCode===null)await new Promise(resolve=>child.once('exit',resolve));}
    await rm(temp,{recursive:true,force:true});
  }
});
