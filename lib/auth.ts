import {cookies} from 'next/headers';
import {database} from '@/db';
import bcrypt from 'bcryptjs';
export const COOKIE='magnat_session';
export type User={id:string;username:string;phone:string|null;name:string;role:'owner'|'staff';active:number};
export const now=()=>Math.floor(Date.now()/1000);
export async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')}
export async function hasOwner(){return !!await database().prepare("SELECT id FROM users WHERE id='owner'").first()}
export async function currentUser():Promise<User|null>{const token=(await cookies()).get(COOKIE)?.value;if(!token||!/^[a-f0-9]{64}$/.test(token))return null;return database().prepare('SELECT u.id,u.username,u.phone,u.name,u.role,u.active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>? AND u.active=1').bind(await digest(token),now()).first<User>()}
export async function passwordHash(password:string){return bcrypt.hash(password,12)}
export async function passwordMatches(password:string,hash:string){return bcrypt.compare(password,hash)}
export function validPassword(password:unknown):password is string{return typeof password==='string'&&password.length>=12&&new TextEncoder().encode(password).length<=72}
export function authJson(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}})}
export function sameOrigin(request:Request){return request.headers.get('origin')===new URL(request.url).origin&&request.headers.get('sec-fetch-site')!=='cross-site'}
export async function sessionResponse(userId:string,request:Request){const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');await database().prepare('INSERT INTO sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await digest(token),userId,now()+28800).run();const response=authJson({ok:true});response.headers.set('Set-Cookie',`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${new URL(request.url).protocol==='https:'?'; Secure':''}`);return response}
export async function rateLimit(key:string,max=8){const t=now();const result=await database().prepare('INSERT INTO login_limits(key,attempts,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN until<=? THEN 1 ELSE attempts+1 END, until=CASE WHEN until<=? THEN ? ELSE until END RETURNING attempts').bind(key,t+900,t,t,t+900).first<{attempts:number}>();return (result?.attempts??max+1)<=max}

export function newRecoveryCode(){return Array.from(crypto.getRandomValues(new Uint8Array(20)),b=>b.toString(16).padStart(2,'0')).join('').match(/.{1,8}/g)!.join('-')}
export async function recoveryDigest(value:string){return digest(value.replace(/[-\s]/g,'').toLowerCase())}
