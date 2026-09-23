import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {writeFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {dayRange} from '../lib/report-date.ts';
const base='http://localhost:5173',suffix=randomUUID().replaceAll('-',''),owner='backup-test-'+suffix,username='b_'+suffix,password=randomUUID()+'Test';
const product='product-'+suffix,docs=[0,1,2,3,4].map(i=>'doc-'+suffix+i),file='work/report-fixture.sql';
const backupFile='work/test-backup-'+suffix+'.json',restored='work/test-restored-'+suffix+'.sqlite';
function sql(text){writeFileSync(file,text);const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',file],{encoding:'utf8'});if(r.status)throw Error('Fixture operation failed');}
async function get(date,cookie){const r=await fetch(base+'/api/reports?date='+date,{headers:{Cookie:cookie}});return {status:r.status,data:await r.json()}}
const {start,end}=dayRange('2098-04-12');assert.equal(start,Date.parse('2098-04-11T18:00:00Z')/1000);assert.equal(end-start,86400);assert.throws(()=>dayRange('2026-02-30'));assert.throws(()=>dayRange('x'));
const hash=await bcrypt.hash(password,12);
sql(`INSERT INTO users(id,username,name,password_hash,role,active,created) VALUES('${owner}','${username}','Backup test','${hash}','owner',1,0); INSERT INTO products(id,name,category,price,stock,cost,minimum) VALUES('${product}','Test','Цветы',500,5,100,0);`);
try{
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({action:'login',username,password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const baseline=(await get('2098-04-12',cookie)).data;
 sql(docs.map((id,i)=>`INSERT INTO documents(id,kind,created,actor,note,summary,revenue,fingerprint) VALUES('${id}','${i===3?'writeoff':i===4?'receipt':'sale'}',${[start-1,start,end,start+1,start+2][i]},'${owner}','','Test',${i<3?1000:0},'${id}');`).join('\n')+`INSERT INTO movements(document_id,product_id,quantity,cost) VALUES('${docs[1]}','${product}',2,100),('${docs[1]}','${product}',1,100),('${docs[3]}','${product}',1,200),('${docs[4]}','${product}',3,150);`);
 const daily=await get('2098-04-12',cookie);assert.equal(daily.status,200);assert.equal(daily.data.revenue-baseline.revenue,1000);assert.equal(daily.data.sales-baseline.sales,1);assert.equal(daily.data.cost-baseline.cost,300);assert.equal(daily.data.loss-baseline.loss,200);assert.equal(daily.data.purchases-baseline.purchases,450);
 assert.equal((await get('2026-02-30',cookie)).status,400);assert.equal((await get('2098-04-12','')).status,401);
 const backup=async(c,p)=>fetch(base+'/api/backup',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:c},body:JSON.stringify({password:p})});
 assert.equal((await backup('',password)).status,403);assert.equal((await backup(cookie,'incorrect')).status,400);
 const r=await backup(cookie,password);assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/attachment/);const data=await r.json();assert.equal(data.tables.sessions,undefined);assert.equal(data.tables.login_limits,undefined);writeFileSync(backupFile,JSON.stringify(data));
 const restore=spawnSync(process.execPath,['scripts/restore-backup.mjs',backupFile,restored],{encoding:'utf8'});assert.equal(restore.status,0,restore.stderr);
 const db=new DatabaseSync(restored);for(const [name,rows]of Object.entries(data.tables))assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n,rows.length);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
 assert.notEqual(spawnSync(process.execPath,['scripts/restore-backup.mjs',backupFile,restored],{encoding:'utf8'}).status,0);
 sql(`UPDATE users SET role='staff' WHERE id='${owner}';`);assert.equal((await backup(cookie,password)).status,403);
 console.log('PASS: Bishkek midnight boundaries, sales with multiple lines, costs/writeoffs/purchases, invalid date, authorization, owner reauthentication, snapshot contents, full restore, integrity, no active sessions, no overwrite, staff denied.');
}finally{
 sql(`DELETE FROM movements WHERE document_id IN (${docs.map(d=>`'${d}'`).join(',')});DELETE FROM documents WHERE actor='${owner}';DELETE FROM products WHERE id='${product}';DELETE FROM sessions WHERE user_id='${owner}';DELETE FROM users WHERE id='${owner}';`);
 for(const f of [file,backupFile,restored])try{unlinkSync(f)}catch{}
}
