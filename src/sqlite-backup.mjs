/** Offline-only private SQLite backup/verify/restore. Does not replace JSON backup.
 * Never uses raw copying of a live SQLite database. Backups use Node's online
 * SQLite backup API, are integrity checked, and publish to new paths only.
 */
import { backup, DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, open, link, unlink, readFile, stat, access } from 'node:fs/promises';
import { dirname, basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectSqlite } from './sqlite-migrate.mjs';
import { validateSqliteTarget } from './sqlite-store.mjs';

const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
const digest = b => createHash('sha256').update(b).digest('hex');
async function assertOffline(source) {
  try { await access(source + '.lock'); }
  catch (e) { if (e.code === 'ENOENT') return; throw e; }
  throw new Error('Refusing offline backup while a server lock exists; verify that all writers are stopped');
}
async function candidate(destination, suffix) {
  await mkdir(dirname(destination), {recursive:true,mode:0o700});
  const tmp=join(dirname(destination),`.gcb-${basename(destination)}-${randomUUID()}.${suffix}.tmp`);
  const handle=await open(tmp,'wx',0o600);
  await handle.close();
  return tmp;
}
async function syncFile(file) {
  const handle=await open(file,'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
async function verified(path) {
  const target=validateSqliteTarget(path);
  const info=await stat(target);
  if(!info.isFile()||info.size>MAX_BACKUP_BYTES||info.mode&0o077){
    throw new Error('Backup must be a private regular SQLite file (up to 256 MiB)');
  }
  const [bytes, manifest]=await Promise.all([readFile(target),readFile(target+'.sha256','utf8')]);
  const expected=manifest.trim();
  if(!/^[0-9a-f]{64}$/.test(expected))throw new Error('Invalid SQLite backup checksum manifest');
  const sha256=digest(bytes);
  if(!timingSafeEqual(Buffer.from(sha256,'hex'),Buffer.from(expected,'hex'))){
    throw new Error('SQLite backup checksum mismatch');
  }
  const {summary}=await inspectSqlite(target);
  return {target,bytes,sha256,bookmarks:summary.bookmarks,collections:summary.collections};
}
export async function verifySqliteBackup(path) {
  const {bytes,...result}=await verified(path);
  return {...result,size:bytes.length};
}
export async function backupSqlite(source, directory) {
  if(!directory || typeof directory!=='string') throw new Error('A private backup destination folder is required');
  const file=validateSqliteTarget(source);
  await assertOffline(file);
  const info=await stat(file);
  if(!info.isFile() || (info.mode & 0o077))throw new Error('SQLite source must be a private regular file');
  const folder=resolve(directory);
  const name='bookmarks-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)+'.sqlite';
  const target=join(folder,name),manifest=target+'.sha256';
  const temp=await candidate(target,'sqlite');
  let sourceDb,linked=false,manifestCreated=false;
  try {
    const before=await inspectSqlite(file);
    sourceDb=new DatabaseSync(file,{readOnly:true});
    await backup(sourceDb,temp);
    sourceDb.close();sourceDb=null;
    await syncFile(temp);
    const after=await inspectSqlite(temp);
    if(JSON.stringify(after.data)!==JSON.stringify(before.data)){
      throw new Error('Source changed during backup; restart from an offline snapshot');
    }
    const bytes=await readFile(temp);
    if(bytes.length>MAX_BACKUP_BYTES)throw new Error('SQLite backup exceeds 256 MiB');
    const sha256=digest(bytes);
    // Publish both private files without overwriting an existing path.
    const m=await open(manifest,'wx',0o600);manifestCreated=true;
    try{await m.writeFile(sha256+'\n');await m.sync();}finally{await m.close();}
    await link(temp,target);linked=true;
    const result=await verifySqliteBackup(target);
    return result;
  }catch(e){
    if(linked)await unlink(target).catch(()=>{});
    if(manifestCreated)await unlink(manifest).catch(()=>{});
    throw e;
  }finally{
    if(sourceDb)try{sourceDb.close();}catch{}
    await unlink(temp).catch(()=>{});
  }
}
export async function restoreSqliteBackup(source,destination){
  const {bytes,sha256,bookmarks,collections}=await verified(source);
  const target=validateSqliteTarget(destination);
  if(resolve(source)===target||resolve(source)+'.sha256'===target){
    throw new Error('Cannot restore backup over its own source or manifest');
  }
  const temp=await candidate(target,'sqlite');
  try{
    const handle=await open(temp,'w',0o600);
    try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
    await inspectSqlite(temp);
    try{await link(temp,target);}catch(e){
      if(e.code==='EEXIST')throw new Error('Restore destination already exists; existing data preserved');
      throw e;
    }
    return {target,sha256,bookmarks,collections,size:bytes.length};
  }finally{await unlink(temp).catch(()=>{});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [operation,a,b,...rest]=process.argv.slice(2);
  try{
    if(rest.length)throw new Error('Too many arguments');
    const result=operation==='backup'&&a&&b?await backupSqlite(a,b):
      operation==='verify'&&a&&!b?await verifySqliteBackup(a):
      operation==='restore'&&a&&b?await restoreSqliteBackup(a,b):null;
    if(!result)throw new Error('Usage: sqlite-backup.mjs backup DB DIRECTORY | verify BACKUP.sqlite | restore BACKUP.sqlite NEW.sqlite');
    console.log(JSON.stringify(result,null,2));
  }catch(e){console.error('SQLite backup operation failed:',e.message);process.exitCode=1;}
}
