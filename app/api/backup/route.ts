import {database} from '@/db';
import {authJson,currentUser,passwordMatches,rateLimit,sameOrigin} from '@/lib/auth';
import {backupColumns,backupVersion} from '@/lib/backup-format';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!sameOrigin(request))return authJson({error:'Запрос запрещён.'},403);
 try{const user=await currentUser();if(user?.role!=='owner')return authJson({error:'Скачать резервную копию может только владелец.'},403);
 if(!await rateLimit('backup:'+user.id))return authJson({error:'Слишком много попыток. Подождите 15 минут.'},429);
 const raw=await request.text();if(raw.length>1024)return authJson({error:'Слишком большой запрос.'},413);const v=JSON.parse(raw);
 if(typeof v.password!=='string'||new TextEncoder().encode(v.password).length>72)return authJson({error:'Введите пароль владельца.'},400);
 const row=await database().prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first<{password_hash:string}>();
 if(!row||!await passwordMatches(v.password,row.password_hash))return authJson({error:'Неверный пароль владельца.'},400);
 const names=Object.keys(backupColumns) as (keyof typeof backupColumns)[];
 // All reads share one D1 transaction; ongoing sales cannot split the snapshot.
 const results=await database().batch(names.map(name=>database().prepare(`SELECT ${backupColumns[name].join(',')} FROM ${name}`)));
 const createdAt=new Date().toISOString();
 return new Response(JSON.stringify({format:'magnat-flower-backup',version:backupVersion,createdAt,currency:'KGS',timezone:'Asia/Bishkek',tables:Object.fromEntries(names.map((name,i)=>[name,results[i].results]))},null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Disposition':`attachment; filename="magnat-flower-${createdAt.replace(/[:.]/g,'-')}.json"`,'X-Content-Type-Options':'nosniff'}});
 }catch{return authJson({error:'Не удалось создать резервную копию. Повторите попытку.'},503)}
}
