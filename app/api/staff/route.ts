import {database} from '@/db';
import {normalizePhone} from '@/lib/phone';
import {authJson,currentUser,now,passwordHash,sameOrigin,validPassword} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function GET(){try{const user=await currentUser();if(user?.role!=='owner')return authJson({error:'Доступ только владельцу.'},403);return authJson({users:(await database().prepare('SELECT id,username,phone,name,role,active FROM users ORDER BY created').all()).results})}catch{return authJson({error:'Не удалось загрузить сотрудников.'},503)}}
export async function POST(request:Request){
 if(!sameOrigin(request))return authJson({error:'Запрос запрещён.'},403);
 try{const user=await currentUser();if(user?.role!=='owner')return authJson({error:'Доступ только владельцу.'},403);
 const raw=await request.text();if(raw.length>4096)return authJson({error:'Слишком большой запрос.'},413);const v=JSON.parse(raw);const db=database();
 if(v.action==='toggle'){
 if(typeof v.id!=='string'||typeof v.active!=='boolean'||v.id==='owner')return authJson({error:'Нельзя отключить владельца.'},400);
 await db.batch([db.prepare("UPDATE users SET active=? WHERE id=? AND role='staff'").bind(v.active?1:0,v.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(v.id)]);return authJson({ok:true});
 }
 if(v.action!=='create')return authJson({error:'Неизвестное действие.'},400);
 const phone=normalizePhone(v.phone);
 const username=phone?'phone_'+phone.slice(1):(typeof v.username==='string'?v.username.trim().toLowerCase():'');
 if(v.phone&&!phone)return authJson({error:'Проверьте номер телефона с кодом страны.'},400);
 if(!/^[a-z0-9._-]{3,40}$/.test(username)||typeof v.name!=='string'||!v.name.trim()||v.name.length>80||!validPassword(v.password))return authJson({error:'Введите имя, логин из 3–40 латинских букв, цифр или . _ - и пароль от 12 символов (до 72 байт).'},400);
 if(await db.prepare('SELECT id FROM users WHERE username=? OR phone=?').bind(username,phone).first())return authJson({error:'Этот логин уже занят.'},409);
 await db.prepare("INSERT INTO users(id,username,phone,name,password_hash,role,active,created) VALUES(?,?,?,?,?,'staff',1,?)").bind(crypto.randomUUID(),username,phone,v.name.trim(),await passwordHash(v.password),now()).run();return authJson({ok:true});
 }catch{return authJson({error:'Не удалось сохранить сотрудника. Проверьте, не занят ли логин.'},503)}
}

