import {database} from '@/db';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {COOKIE,authJson,currentUser,digest,hasOwner,now,passwordHash,passwordMatches,rateLimit,sameOrigin,sessionResponse,validPassword,newRecoveryCode,recoveryDigest} from '@/lib/auth';
import {normalizePhone} from '@/lib/phone';
import {cookies} from 'next/headers';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!sameOrigin(request))return authJson({error:'Обновите страницу и повторите запрос.'},403);
 try{
 const raw=await request.text();if(raw.length>4096)return authJson({error:'Слишком большой запрос.'},413);
 const v=JSON.parse(raw);const db=database();
 if(v.action==='logout'){const token=(await cookies()).get(COOKIE)?.value;if(token)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();const r=authJson({ok:true});r.headers.set('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);return r}
 if(v.action==='recover'){
 if(!await rateLimit('recovery:'+await digest(request.headers.get('cf-connecting-ip')||'local'),20))return authJson({error:'Слишком много попыток. Подождите 15 минут.'},429);
 if(typeof v.code!=='string'||!/^[a-f0-9\s-]{40,60}$/i.test(v.code)||!validPassword(v.password))return authJson({error:'Проверьте резервный код. Новый пароль должен содержать от 12 символов (до 72 байт).'},400);
 const codeHash=await recoveryDigest(v.code);
 const user=await db.prepare('SELECT id,username,phone FROM users WHERE recovery_hash=? AND active=1').bind(codeHash).first<{id:string;username:string;phone:string|null}>();
 if(!user)return authJson({error:'Код неверен, уже использован или аккаунт отключён.'},400);
 const nextCode=newRecoveryCode();
 const results=await db.batch([db.prepare('UPDATE users SET password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=?').bind(await passwordHash(v.password),await recoveryDigest(nextCode),user.id,codeHash),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)]);
 if(!results[0].meta.changes)return authJson({error:'Этот код уже использован.'},409);
 await db.prepare('DELETE FROM login_limits WHERE key=?').bind('login-user:'+user.id).run();
 return authJson({ok:true,recoveryCode:nextCode,identifier:user.phone||user.username});
 }
 if(v.action==='password'||v.action==='phone'||v.action==='recovery-code'){
 const user=await currentUser();if(!user)return authJson({error:'Войдите в аккаунт.'},401);
 if(!await rateLimit('password:'+user.id))return authJson({error:'Слишком много попыток. Подождите 15 минут.'},429);
 if(typeof v.currentPassword!=='string'||new TextEncoder().encode(v.currentPassword).length>72)return authJson({error:'Введите текущий пароль.'},400);
 const row=await db.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first<{password_hash:string}>();
 if(!row||!await passwordMatches(v.currentPassword,row.password_hash))return authJson({error:'Текущий пароль неверен.'},400);
 if(v.action==='phone'){
 const phone=normalizePhone(v.phone);if(!phone)return authJson({error:'Введите номер с кодом страны, например +996 555 123 456.'},400);
 if(await db.prepare('SELECT id FROM users WHERE phone=? AND id<>?').bind(phone,user.id).first())return authJson({error:'Этот номер уже используется.'},409);
 await db.prepare('UPDATE users SET phone=? WHERE id=?').bind(phone,user.id).run();return authJson({ok:true});
 }
 if(v.action==='recovery-code'){const code=newRecoveryCode();await db.prepare('UPDATE users SET recovery_hash=? WHERE id=?').bind(await recoveryDigest(code),user.id).run();return authJson({ok:true,recoveryCode:code});}
 if(!validPassword(v.password))return authJson({error:'Новый пароль: от 12 символов, не более 72 байт.'},400);
 await db.batch([db.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await passwordHash(v.password),user.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id)]);return sessionResponse(user.id,request);
 }
 if(v.action!=='login'&&v.action!=='setup')return authJson({error:'Неизвестное действие.'},400);
 const identifier=typeof v.username==='string'?v.username.trim().toLowerCase():'';
 const phone=normalizePhone(identifier);const username=phone?'phone_'+phone.slice(1):identifier;
 if(!/^[a-z0-9._-]{3,40}$/.test(username)||typeof v.password!=='string'||new TextEncoder().encode(v.password).length>72)return authJson({error:'Проверьте номер телефона или прежний логин и пароль.'},400);
 if(v.action==='setup'){
 if(!await getChatGPTUser())return authJson({error:'Откройте страницу первоначальной настройки заново.'},403);
 if(await hasOwner())return authJson({error:'Владелец уже создан. Войдите в аккаунт.'},409);
 if(!phone||!validPassword(v.password)||typeof v.name!=='string'||!v.name.trim()||v.name.length>80)return authJson({error:'Введите имя, телефон с кодом страны и пароль от 12 символов (до 72 байт).'},400);
 const code=newRecoveryCode();
 await db.prepare("INSERT INTO users(id,username,phone,recovery_hash,name,password_hash,role,active,created) VALUES('owner',?,?,?,?,?,'owner',1,?)").bind(username,phone,await recoveryDigest(code),v.name.trim(),await passwordHash(v.password),now()).run();
 // Show the one-time backup code before asking the owner to sign in.
 return authJson({ok:true,recoveryCode:code,identifier:phone});
 }
 const row=await db.prepare(phone?'SELECT id,password_hash,active FROM users WHERE phone=?':'SELECT id,password_hash,active FROM users WHERE username=?').bind(phone||username).first<{id:string;password_hash:string;active:number}>();
 const rateKey=row?'login-user:'+row.id:'login:'+await digest(username);
 if(!await rateLimit(rateKey))return authJson({error:'Слишком много попыток входа. Подождите 15 минут.'},429);
 const dummy='$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW';
 const ok=await passwordMatches(v.password,row?.password_hash??dummy);
 if(!row||!row.active||!ok)return authJson({error:'Неверный телефон, логин или пароль.'},401);
 await db.prepare('DELETE FROM login_limits WHERE key=?').bind(rateKey).run();
 await db.prepare('DELETE FROM sessions WHERE expires<=?').bind(now()).run();
 return sessionResponse(row.id,request);
 }catch{console.error('Authentication request failed');return authJson({error:'Не удалось выполнить запрос. Попробуйте ещё раз.'},503)}
}

