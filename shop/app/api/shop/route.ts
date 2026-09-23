import {database} from '@/db';
import {documentTotals,movementTotals} from '@/lib/report-sql';
import {currentUser as getChatGPTUser} from '@/lib/auth';
import {z} from 'zod';
export const dynamic='force-dynamic';
const id=z.string().uuid();
const price=z.number().finite().positive().max(10000000).transform(v=>Math.round(v*100));
const line=z.object({id,quantity:z.number().int().min(1).max(100000),cost:z.number().finite().min(0).max(10000000).optional()});
const input=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('product'),id,name:z.string().trim().min(1).max(100),category:z.enum(['Цветы','Зелень','Упаковка','Аксессуары']),price,minimum:z.number().int().min(0).max(100000)}),
 z.object({kind:z.literal('recipe'),id,name:z.string().trim().min(1).max(100),price,lines:z.array(line).min(1).max(30)}),
 z.object({kind:z.enum(['sale','receipt','writeoff']),id,note:z.string().trim().max(300).default(''),lines:z.array(line).min(1).max(30)})
]);
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){console.error('Shop request failed',error);const msg=String(error);if(msg.includes('stock_nonnegative'))return json({error:'Недостаточно товара на складе. Обновите остатки и проверьте количество.'},409);return json({error:'Не удалось сохранить или загрузить данные. Повторите попытку.'},503)}
export async function GET(){
 if(!await getChatGPTUser())return json({error:'Войдите в аккаунт, которому открыт доступ к магазину.'},401);
 try{const db=database();const results=await db.batch<Record<string,any>>([
 db.prepare('SELECT * FROM products ORDER BY name'),db.prepare('SELECT * FROM recipes ORDER BY name'),db.prepare('SELECT recipe_id AS recipeId, product_id AS productId, quantity FROM parts'),
 db.prepare(`SELECT d.*, (SELECT id FROM documents r WHERE r.reverse_of=d.id) AS reversed_by, CASE WHEN d.kind IN ('sale','refund') OR (d.kind='cancel' AND d.revenue<>0) THEN d.revenue WHEN d.kind='expense' OR d.expense<>0 THEN d.expense ELSE COALESCE((SELECT SUM(m.quantity*m.cost) FROM movements m WHERE m.document_id=d.id),0) END AS amount FROM documents d ORDER BY created DESC,rowid DESC LIMIT 100`),
 db.prepare(documentTotals).bind(0,4133980800),db.prepare(movementTotals).bind(0,4133980800)
 ]);return json({products:results[0].results,recipes:results[1].results.map(r=>({...r,parts:results[2].results.filter(p=>p.recipeId===r.id)})),documents:results[3].results,report:{...results[4].results[0],...results[5].results[0]}})}catch(e){return failure(e)}
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'Необходим вход в аккаунт.'},401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Запрос с другого сайта запрещён.'},403);
 if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Ожидается JSON.'},415);
 const raw=await request.text();if(raw.length>30000)return json({error:'Документ слишком большой.'},413);
 let parsed;try{parsed=input.safeParse(JSON.parse(raw))}catch{return json({error:'Некорректный документ.'},400)}
 if(!parsed.success)return json({error:'Проверьте названия, цены, товары и целое количество от 1 до 100 000.'},400);
 const v=parsed.data;
 if(v.kind!=='product'&&new Set(v.lines.map(l=>l.id)).size!==v.lines.length)return json({error:'Товар повторяется. Объедините его количество в одной строке.'},400);
 try{const db=database();
 if(v.kind==='product'){
 const old=await db.prepare('SELECT * FROM products WHERE id=?').bind(v.id).first();
 if(old)return old.name===v.name&&old.price===v.price&&old.category===v.category&&old.minimum===v.minimum?json({ok:true}):json({error:'Этот идентификатор уже используется.'},409);
 await db.prepare('INSERT INTO products(id,name,category,price,minimum) VALUES(?,?,?,?,?)').bind(v.id,v.name,v.category,v.price,v.minimum).run();return json({ok:true});
 }
 const rows=await db.prepare('SELECT * FROM products').all();const products=new Map(rows.results.map(p=>[p.id,p]));
 if(v.kind==='recipe'){
 if(v.lines.some(l=>!products.has(l.id)))return json({error:'Выберите существующие товары.'},400);
 const old=await db.prepare('SELECT * FROM recipes WHERE id=?').bind(v.id).first();
 if(old){const oldParts=await db.prepare('SELECT product_id,quantity FROM parts WHERE recipe_id=?').bind(v.id).all();return old.name===v.name&&old.price===v.price&&oldParts.results.length===v.lines.length&&v.lines.every(l=>oldParts.results.some(p=>p.product_id===l.id&&p.quantity===l.quantity))?json({ok:true}):json({error:'Этот идентификатор уже используется.'},409)}
 await db.batch([db.prepare('INSERT INTO recipes(id,name,price) VALUES(?,?,?)').bind(v.id,v.name,v.price),...v.lines.map(l=>db.prepare('INSERT INTO parts(recipe_id,product_id,quantity) VALUES(?,?,?)').bind(v.id,l.id,l.quantity))]);return json({ok:true});
 }
 if(v.kind==='writeoff'&&!v.note)return json({error:'Укажите причину списания.'},400);
 if(v.kind==='receipt'&&v.lines.some(l=>!l.cost||l.cost<0.01))return json({error:'Укажите положительную закупочную цену для каждой позиции.'},400);
 const fingerprint=JSON.stringify(v);
 const existing=await db.prepare('SELECT fingerprint FROM documents WHERE id=?').bind(v.id).first();
 if(existing)return existing.fingerprint===fingerprint?json({ok:true}):json({error:'Документ уже сохранён с другим содержимым. Закройте форму и создайте новый.'},409);
 const quantities=new Map<string,{quantity:number;cost:number}>();let revenue=0;const summary:string[]=[];
 const add=(pid:string,q:number,c=0)=>{const prev=quantities.get(pid);quantities.set(pid,{quantity:q+(prev?.quantity||0),cost:c})};
 for(const l of v.lines){const p=products.get(l.id);if(p){add(l.id,l.quantity,Math.round((l.cost||0)*100));revenue+=Number(p.price)*l.quantity;summary.push(`${p.name} × ${l.quantity}`)}else if(v.kind==='sale'){
 const recipe=await db.prepare('SELECT * FROM recipes WHERE id=?').bind(l.id).first();if(!recipe)return json({error:'Букет не найден.'},400);
 const parts=await db.prepare('SELECT * FROM parts WHERE recipe_id=?').bind(l.id).all();if(!parts.results.length)return json({error:'У букета отсутствует состав.'},400);
 for(const part of parts.results)add(String(part.product_id),Number(part.quantity)*l.quantity);
 revenue+=Number(recipe.price)*l.quantity;summary.push(`${recipe.name} × ${l.quantity}`);
 }else return json({error:'Товар не найден.'},400)}
 if(quantities.size>80||[...quantities.values()].some(q=>q.quantity>100000))return json({error:'Слишком большой документ. Уменьшите количество позиций или товаров.'},400);
 // D1 batch is transactional: the stock CHECK aborts the entire document under concurrent sales.
 const statements=[db.prepare('INSERT INTO documents(id,kind,created,actor,note,summary,revenue,fingerprint) VALUES(?,?,?,?,?,?,?,?)').bind(v.id,v.kind,Math.floor(Date.now()/1000),user.id,v.note,summary.join(', '),v.kind==='sale'?revenue:0,fingerprint)];
 for(const [pid,l]of quantities){
 if(v.kind==='receipt'){
 statements.push(db.prepare('INSERT INTO movements(document_id,product_id,quantity,cost) VALUES(?,?,?,?)').bind(v.id,pid,l.quantity,l.cost));
 statements.push(db.prepare('UPDATE products SET cost=CAST(ROUND((stock*cost+?*?)*1.0/(stock+?)) AS INTEGER),stock=stock+? WHERE id=?').bind(l.quantity,l.cost,l.quantity,l.quantity,pid));
 }else{
 statements.push(db.prepare('INSERT INTO movements(document_id,product_id,quantity,cost) SELECT ?,id,?,cost FROM products WHERE id=?').bind(v.id,l.quantity,pid));
 statements.push(db.prepare('UPDATE products SET stock=stock-? WHERE id=?').bind(l.quantity,pid));
 }}
 try{await db.batch(statements)}catch(e){const saved=await db.prepare('SELECT fingerprint FROM documents WHERE id=?').bind(v.id).first();if(saved?.fingerprint===fingerprint)return json({ok:true});throw e}
 return json({ok:true});
 }catch(e){return failure(e)}
}



