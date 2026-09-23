import {database} from '@/db';
import {documentTotals,movementTotals} from '@/lib/report-sql';
import {currentUser,authJson} from '@/lib/auth';
import {dayRange,shopToday} from '@/lib/report-date';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!await currentUser())return authJson({error:'Войдите в аккаунт.'},401);
 const day=new URL(request.url).searchParams.get('date')||shopToday();let range;
 try{range=day==='all'?{start:0,end:4133980800}:dayRange(day)}catch(e){return authJson({error:e instanceof Error?e.message:'Неверная дата.'},400)}
 try{const db=database(),{start,end}=range;const r=await db.batch<Record<string,number>>([
 db.prepare(documentTotals).bind(start,end),db.prepare(movementTotals).bind(start,end)
 ]);return authJson({date:day,timezone:'Asia/Bishkek',...r[0].results[0],...r[1].results[0]})}catch{return authJson({error:'Не удалось загрузить отчёт. Повторите попытку.'},503)}
}


