import {randomBytes,createHash} from 'node:crypto';
import {writeFileSync,unlinkSync,mkdirSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const username=process.argv[2];
if(!username||!/^[a-z0-9._-]{3,40}$/.test(username))throw Error('Specify an existing username.');
const output=path.resolve('work',`recovery-${username}.txt`);
if(existsSync(output))throw Error('Recovery file already exists; preserve it.');
mkdirSync('work',{recursive:true});
const raw=randomBytes(20).toString('hex');const code=raw.match(/.{1,8}/g).join('-');
const hash=createHash('sha256').update(raw).digest('hex');
const sql=path.resolve('work','create-initial-recovery.sql');
writeFileSync(sql,`UPDATE users SET recovery_hash='${hash}' WHERE username='${username}' AND active=1 AND recovery_hash IS NULL RETURNING id;`);
try{
const r=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',sql,'--json'],{encoding:'utf8'});
if(r.status)throw Error('Could not initialize recovery code.');
const result=JSON.parse(r.stdout);if(result[0]?.results?.length!==1)throw Error('Account not found or a recovery code is already configured. No code replaced.');
writeFileSync(output,`Magnat Flower — резервный код для ${username}\n\n${code}\n\nОткройте http://localhost:5173/login → «Забыли логин или пароль?»\nВставьте этот код и самостоятельно задайте новый пароль.\nКод одноразовый. После сброса сохраните новый код, который покажет сайт.\nХраните файл в надёжном месте. Не передавайте код посторонним.\n`,{flag:'wx'});
console.log('Recovery code saved to '+output);
}finally{unlinkSync(sql)}

