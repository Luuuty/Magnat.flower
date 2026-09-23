export function shopToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bishkek',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
export function dayRange(day:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Некорректная дата.');
 const calendar=new Date(day+'T00:00:00Z');
 if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==day||day<'2006-01-01'||day>'2100-12-31')throw Error('Выберите существующую дату с 2006 по 2100 год.');
 // Kyrgyzstan uses UTC+6 throughout the supported reporting period from 2005 onward.
 // Derive the actual offset with the IANA timezone database for earlier dates too.
 const probe=new Date(day+'T12:00:00Z');
 const offsetText=new Intl.DateTimeFormat('en',{timeZone:'Asia/Bishkek',timeZoneName:'longOffset'}).formatToParts(probe).find(p=>p.type==='timeZoneName')!.value;
 const match=offsetText.match(/GMT([+-])(\d{2}):(\d{2})/);if(!match)throw Error('Не удалось определить часовой пояс.');
 const offset=(Number(match[2])*60+Number(match[3]))*60*(match[1]==='+'?1:-1);
 const start=calendar.getTime()/1000-offset;
 return {start,end:start+86400};
}

