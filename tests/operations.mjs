import assert from 'node:assert/strict';import bcrypt from 'bcryptjs';import {randomUUID} from 'node:crypto';import {writeFileSync,unlinkSync} from 'node:fs';import {spawnSync} from 'node:child_process';
const base='http://localhost:5173',actor='ops-'+randomUUID(),username='o_'+randomUUID().replaceAll('-',''),password=randomUUID()+'X',p=randomUUID(),r=randomUUID();let cookie='';const file='work/ops-test.sql';
function sql(text){writeFileSync(file,text);const x=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file',file],{encoding:'utf8'});if(x.status)throw Error('Fixture failed')}
async function post(url,body,status=200){const response=await fetch(base+url,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return response}
async function shop(){return (await fetch(base+'/api/shop',{headers:{Cookie:cookie}})).json()}
async function stock(){return (await shop()).products.find(x=>x.id===p).stock}
const op=(kind,fields={})=>({id:randomUUID(),kind,note:'Проверка',...fields});
sql(`INSERT INTO users(id,username,name,password_hash,role,active,created) VALUES('${actor}','${username}','Test','${await bcrypt.hash(password,12)}','owner',1,0);`);
try{
 const login=await post('/api/auth',{action:'login',username,password});cookie=login.headers.get('set-cookie').split(';')[0];const baseline=(await shop()).report;
 await post('/api/shop',{kind:'product',id:p,name:'Test rose',category:'Цветы',price:100,minimum:1});
 const receipt=op('receipt',{lines:[{id:p,quantity:20,cost:40}]});await post('/api/shop',receipt);
 await post('/api/operations',op('edit-product',{targetId:p,name:'Updated rose',category:'Цветы',price:120,minimum:3}));assert.equal(await stock(),20);
 await post('/api/shop',{kind:'recipe',id:r,name:'Test bouquet',price:500,lines:[{id:p,quantity:3}]});
 const sale=op('sale',{lines:[{id:r,quantity:2}]});await post('/api/shop',sale);assert.equal(await stock(),14);
 await post('/api/operations',op('edit-recipe',{targetId:r,name:'Changed bouquet',price:700,lines:[{id:p,quantity:5}]}));
 const refund=op('refund',{targetId:sale.id});await post('/api/operations',refund);await post('/api/operations',refund);assert.equal(await stock(),20);
 await post('/api/operations',op('cancel',{targetId:sale.id}),409);
 await post('/api/operations',op('cancel',{targetId:receipt.id}),409);
 const expense=op('expense',{category:'Аренда',amount:300});await post('/api/operations',expense);assert.equal((await shop()).report.expenses-baseline.expenses,30000);
 await post('/api/operations',op('cancel',{targetId:expense.id}));assert.equal((await shop()).report.expenses-baseline.expenses,0);
 await post('/api/operations',op('inventory',{lines:[{id:p,expected:19,actual:18}]}),409);
 const inv=op('inventory',{lines:[{id:p,expected:20,actual:18}]});await post('/api/operations',inv);assert.equal(await stock(),18);assert.equal((await shop()).report.loss-baseline.loss,8000);
 await post('/api/operations',op('cancel',{targetId:inv.id}));assert.equal(await stock(),20);
 const extra=op('receipt',{lines:[{id:p,quantity:5,cost:60}]});await post('/api/shop',extra);assert.equal(await stock(),25);await post('/api/operations',op('cancel',{targetId:extra.id}));assert.equal(await stock(),20);assert.equal((await shop()).products.find(x=>x.id===p).cost,4000);
 const d=(await shop());assert.equal(d.report.revenue-baseline.revenue,0);assert.equal(d.report.cost-baseline.cost,0);assert.equal(d.report.loss-baseline.loss,0);assert.equal(d.documents.find(x=>x.id===sale.id).reversed_by,refund.id);
 const concurrent=await Promise.all([1,2].map(()=>fetch(base+'/api/operations',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(op('cancel',{targetId:extra.id}))}).then(x=>x.status)));assert.deepEqual(concurrent,[409,409]);
 console.log('PASS: product/recipe edits, historic recipe refund, repeat protection, duplicate reversal rejection, receipt safety, expenses/cancellation, inventory stale rejection/adjustment/cancellation, receipt cost reversal, net reports, audit history.');
}finally{sql(`DELETE FROM movements WHERE document_id IN (SELECT id FROM documents WHERE actor='${actor}');DELETE FROM documents WHERE actor='${actor}';DELETE FROM parts WHERE recipe_id='${r}';DELETE FROM recipes WHERE id='${r}';DELETE FROM products WHERE id='${p}';DELETE FROM sessions WHERE user_id='${actor}';DELETE FROM users WHERE id='${actor}';`);unlinkSync(file)}
