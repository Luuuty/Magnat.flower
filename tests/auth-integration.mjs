import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {writeFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const base='http://localhost:5173',suffix=randomUUID().replaceAll('-','').slice(0,10),owner='test-owner-'+suffix,username='test_'+suffix,staffname='staff_'+suffix,password='Aa-'+randomUUID(),newPassword='Bb-'+randomUUID();
const file='work/auth-fixture.sql';
function sql(text){writeFileSync(file,text);const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',file],{encoding:'utf8'});if(r.status)throw Error('Fixture database operation failed');}
async function post(url,body,cookie='',status=200){const r=await fetch(base+url,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,d.error||url);return {d,cookie:r.headers.get('set-cookie')?.split(';')[0]||'',headers:r.headers};}
async function get(url,cookie='',status=200){const r=await fetch(base+url,{headers:{Cookie:cookie}});assert.equal(r.status,status);return r.json();}
const hash=await bcrypt.hash(password,12);
sql(`INSERT INTO users(id,username,name,password_hash,role,active,created) VALUES('${owner}','${username}','Проверка авторизации','${hash}','owner',1,0);`);
try{
await get('/api/shop','',401);
await get('/api/shop','__sites_local_auth=1',401);
await post('/api/auth',{action:'login',username,password:'incorrect'},'',401);
const login=await post('/api/auth',{action:'login',username,password});const cookie=login.cookie;
assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/SameSite=Strict/);
await get('/api/shop',cookie);
await post('/api/staff',{action:'create',username:staffname,name:'Проверка сотрудника',password},cookie);
const list=await get('/api/staff',cookie);assert.ok(!JSON.stringify(list).includes('password_hash'));const staff=list.users.find(u=>u.username===staffname);
const staffLogin=await post('/api/auth',{action:'login',username:staffname,password});await get('/api/shop',staffLogin.cookie);await get('/api/staff',staffLogin.cookie,403);
await post('/api/staff',{action:'toggle',id:staff.id,active:false},staffLogin.cookie,403);
await post('/api/staff',{action:'toggle',id:staff.id,active:false},cookie);await get('/api/shop',staffLogin.cookie,401);
await post('/api/auth',{action:'login',username:staffname,password},'',401);
await post('/api/staff',{action:'toggle',id:staff.id,active:true},cookie);
const again=await post('/api/auth',{action:'login',username:staffname,password});
const changed=await post('/api/auth',{action:'password',currentPassword:password,password:newPassword},again.cookie);
await get('/api/shop',again.cookie,401);await get('/api/shop',changed.cookie);
await post('/api/auth',{action:'login',username:staffname,password},'',401);
await post('/api/auth',{action:'logout'},changed.cookie);await get('/api/shop',changed.cookie,401);
const cross=await fetch(base+'/api/auth',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({action:'login',username,password})});assert.equal(cross.status,403);
for(let i=0;i<8;i++)await post('/api/auth',{action:'login',username:'missing_'+suffix,password},'',401);
await post('/api/auth',{action:'login',username:'missing_'+suffix,password},'',429);
const finalLogin=await post('/api/auth',{action:'login',username:staffname,password:newPassword});
const testPhone='+996999'+String(Math.floor(Math.random()*1000000)).padStart(6,'0');
await post('/api/auth',{action:'phone',phone:testPhone,currentPassword:'wrong'},finalLogin.cookie,400);
await post('/api/auth',{action:'phone',phone:testPhone,currentPassword:newPassword},finalLogin.cookie);
await post('/api/auth',{action:'login',username:testPhone,password:newPassword});
const recovery=await post('/api/auth',{action:'recovery-code',currentPassword:newPassword},finalLogin.cookie);
assert.match(recovery.d.recoveryCode,/^[a-f0-9-]{44}$/);
const reset=await post('/api/auth',{action:'recover',code:recovery.d.recoveryCode,password});
assert.equal(reset.d.identifier,testPhone);
assert.notEqual(reset.d.recoveryCode,recovery.d.recoveryCode);
await post('/api/auth',{action:'recover',code:recovery.d.recoveryCode,password},'',400);
await get('/api/shop',finalLogin.cookie,401);
await post('/api/auth',{action:'login',username:testPhone,password:newPassword},'',401);
await post('/api/auth',{action:'login',username:testPhone,password});
console.log('PASS: phone binding requires password, phone login, backup code reset, code rotation, single use, session revocation.');
console.log('PASS: password login, no legacy-cookie bypass, protected shop API, staff permissions, no hash exposure, account deactivation, password change, session revocation, logout, cross-origin rejection, attempt limit.');
}finally{
sql(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username IN ('${username}','${staffname}')); DELETE FROM users WHERE username IN ('${username}','${staffname}');`);unlinkSync(file);
}

