import {database} from '@/db';
import {authJson,currentUser,sameOrigin,now} from '@/lib/auth';
import {z} from 'zod';
const base={id:z.string().uuid(),note:z.string().trim().min(1).max(300)};
const item=z.object({id:z.string().uuid(),quantity:z.number().int().min(1).max(100000)});
const schema=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.enum(['cancel','refund']),targetId:z.string().uuid()}),
 z.object({...base,kind:z.literal('expense'),category:z.enum(['Аренда','Зарплата','Доставка','Коммунальные услуги','Другое']),amount:z.number().positive().max(10000000)}),
 z.object({...base,kind:z.literal('inventory'),lines:z.array(z.object({id:z.string().uuid(),expected:z.number().int().min(0),actual:z.number().int().min(0).max(100000)})).min(1).max(80)}),
 z.object({...base,kind:z.literal('edit-product'),targetId:z.string().uuid(),name:z.string().trim().min(1).max(100),category:z.enum(['Цветы','Зелень','Упаковка','Аксессуары']),price:z.number().positive().max(10000000),minimum:z.number().int().min(0).max(100000)}),
 z.object({...base,kind:z.literal('edit-recipe'),targetId:z.string().uuid(),name:z.string().trim().min(1).max(100),price:z.number().positive().max(10000000),lines:z.array(item).min(1).max(30)})
]);
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const user=await currentUser();if(!user)return authJson({error:'Войдите в аккаунт.'},401);if(!sameOrigin(request))return authJson({error:'Запрос запрещён.'},403);
 try{const text=await request.text();if(text.length>30000)return authJson({error:'Документ слишком большой.'},413);const parsed=schema.safeParse(JSON.parse(text));if(!parsed.success)return authJson({error:'Проверьте данные и укажите причину или комментарий.'},400);
 const v=parsed.data,db=database(),fingerprint=JSON.stringify(v);
 const previous=await db.prepare('SELECT fingerprint FROM documents WHERE id=?').bind(v.id).first();if(previous)return previous.fingerprint===fingerprint?authJson({ok:true}):authJson({error:'Документ уже использован.'},409);
 const statements:D1PreparedStatement[]=[];let summary='',revenue=0,expense=0,cost=0,loss=0,purchases=0,reverse:string|null=null;
 const rows=await db.prepare('SELECT * FROM products').all<Record<string,any>>();const products=new Map(rows.results.map(p=>[p.id,p]));
 // Snapshot checks turn concurrent changes into a CHECK failure, rolling back the whole batch.
 function stock(pid:string,delta:number,newCost:number,source?:string){const p=products.get(pid);if(!p)throw Error('Товар не найден.');statements.push(db.prepare(`UPDATE products SET stock=CASE WHEN stock=? AND cost=? ${source?'AND (SELECT document_id FROM movements WHERE product_id=products.id ORDER BY id DESC LIMIT 1)=?':''} THEN stock+? ELSE -1 END,cost=? WHERE id=?`).bind(p.stock,p.cost,...(source?[source]:[]),delta,newCost,pid));}
 if(v.kind==='expense'){expense=Math.round(v.amount*100);summary=v.category;}
 else if(v.kind==='edit-product'){
 const p=products.get(v.targetId);if(!p)return authJson({error:'Товар не найден.'},404);summary=`Товар: ${p.name} → ${v.name}; цена ${p.price/100} → ${v.price} сом; категория ${p.category} → ${v.category}; минимум ${p.minimum} → ${v.minimum}`;
 statements.push(db.prepare('UPDATE products SET name=?,category=?,price=?,minimum=? WHERE id=?').bind(v.name,v.category,Math.round(v.price*100),v.minimum,v.targetId));
 }else if(v.kind==='edit-recipe'){
 const r=await db.prepare('SELECT * FROM recipes WHERE id=?').bind(v.targetId).first();if(!r)return authJson({error:'Букет не найден.'},404);
 if(new Set(v.lines.map(l=>l.id)).size!==v.lines.length||v.lines.some(l=>!products.has(l.id)))return authJson({error:'Выберите разные существующие товары.'},400);
 const old=await db.prepare('SELECT p.name,b.quantity FROM parts b JOIN products p ON p.id=b.product_id WHERE recipe_id=?').bind(v.targetId).all();
 summary=`Букет ${r.name} → ${v.name}; цена ${Number(r.price)/100} → ${v.price} сом; состав: ${old.results.map(p=>`${p.name} × ${p.quantity}`).join(', ')} → ${v.lines.map(l=>`${products.get(l.id)!.name} × ${l.quantity}`).join(', ')}`;
 statements.push(db.prepare('UPDATE recipes SET name=?,price=? WHERE id=?').bind(v.name,Math.round(v.price*100),v.targetId),db.prepare('DELETE FROM parts WHERE recipe_id=?').bind(v.targetId),...v.lines.map(l=>db.prepare('INSERT INTO parts(recipe_id,product_id,quantity) VALUES(?,?,?)').bind(v.targetId,l.id,l.quantity)));
 }else if(v.kind==='inventory'){
 if(new Set(v.lines.map(l=>l.id)).size!==v.lines.length)return authJson({error:'Товар повторяется.'},400);
 const descriptions:string[]=[];
 for(const l of v.lines){const p=products.get(l.id);if(!p||p.stock!==l.expected)return authJson({error:'Остатки изменились. Обновите склад и повторите сверку.'},409);const delta=l.actual-l.expected;if(!delta)continue;if(delta>0&&p.cost===0)return authJson({error:'Для излишков сначала задайте закупочную стоимость через поступление.'},400);stock(l.id,delta,p.cost);loss-=delta*p.cost;descriptions.push(`${p.name}: ${l.expected} → ${l.actual}`);statements.push(db.prepare('INSERT INTO movements(document_id,product_id,quantity,cost) VALUES(?,?,?,?)').bind(v.id,l.id,delta,p.cost));}
 if(!descriptions.length)return authJson({error:'Расхождений нет. Остатки совпадают.'},400);summary=descriptions.join(', ');
 }else{
 const d=await db.prepare('SELECT * FROM documents WHERE id=?').bind(v.targetId).first<Record<string,any>>();if(!d)return authJson({error:'Операция не найдена.'},404);
 if(!['sale','receipt','writeoff','inventory','expense'].includes(d.kind)||v.kind==='refund'&&d.kind!=='sale')return authJson({error:'Эту операцию нельзя вернуть или отменить.'},400);
 if(await db.prepare('SELECT id FROM documents WHERE reverse_of=?').bind(v.targetId).first())return authJson({error:'Операция уже отменена или возвращена.'},409);
 const movements=await db.prepare('SELECT product_id,SUM(quantity) AS quantity,SUM(quantity*cost) AS value FROM movements WHERE document_id=? GROUP BY product_id').bind(v.targetId).all<{product_id:string;quantity:number;value:number}>();
 const value=movements.results.reduce((s,m)=>s+m.value,0);cost=-Number(d.effect_cost??(d.kind==='sale'?value:0));loss=-Number(d.effect_loss??(d.kind==='writeoff'?value:0));purchases=-Number(d.effect_purchases??(d.kind==='receipt'?value:0));revenue=-d.revenue;expense=-d.expense;reverse=v.targetId;summary=`${v.kind==='refund'?'Полный возврат':'Отмена'}: ${d.summary}`;
 for(const m of movements.results){const p=products.get(m.product_id);if(!p)return authJson({error:'Товар не найден.'},409);const delta=(d.kind==='receipt'||d.kind==='inventory')?-m.quantity:m.quantity;const next=p.stock+delta;if(next<0)return authJson({error:'Недостаточно остатков для отмены.'},409);const newCost=next===0?0:Math.round((p.stock*p.cost+(delta>=0?1:-1)*Math.abs(m.value))/next);if(newCost<0)return authJson({error:'Стоимость остатков изменилась. Требуется сверка.'},409);stock(m.product_id,delta,newCost,['receipt','inventory'].includes(d.kind)?v.targetId:undefined);statements.push(db.prepare('INSERT INTO movements(document_id,product_id,quantity,cost) VALUES(?,?,?,?)').bind(v.id,m.product_id,delta,m.quantity?Math.round(m.value/m.quantity):p.cost));}
 }
 statements.unshift(db.prepare('INSERT INTO documents(id,kind,created,actor,note,summary,revenue,fingerprint,reverse_of,expense,effect_cost,effect_loss,effect_purchases) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(v.id,v.kind,now(),user.id,v.note,summary,revenue,fingerprint,reverse,expense,cost,loss,purchases));
 try{await db.batch(statements)}catch(e){const saved=await db.prepare('SELECT fingerprint FROM documents WHERE id=?').bind(v.id).first();if(saved?.fingerprint===fingerprint)return authJson({ok:true});throw e}
 return authJson({ok:true});
 }catch(e){const message=String(e);if(message.includes('stock_nonnegative')||message.includes('UNIQUE'))return authJson({error:'Операция уже изменена или после неё были движения товара. Обновите данные; отмена поступления и сверки возможна только до следующих движений.'},409);console.error('Operation failed',e);return authJson({error:'Не удалось сохранить операцию. Проверьте данные и повторите попытку.'},503)}
}

