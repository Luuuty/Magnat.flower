'use client';
import {useEffect,useRef,useState} from 'react';
import {shopToday} from '@/lib/report-date';

type Totals={revenue:number;cost:number;loss:number;expenses:number;sales:number};
type Daily=Totals&{date:string;purchases:number;receipts:number;writeoffs:number};
const money=(v:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(v/100)+' сом';
export default function Reports(){
 const [date,setDate]=useState(shopToday),[daily,setDaily]=useState<Daily|null>(null),[all,setAll]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false),[reload,setReload]=useState(0);
 const followToday=useRef(true);
 useEffect(()=>{const timer=setInterval(()=>{if(followToday.current)setDate(shopToday());setReload(v=>v+1)},60000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setDaily(null);fetch('/api/reports?date='+encodeURIComponent(all?'all':date),{signal:controller.signal}).then(async r=>{const d=await r.json() as Daily&{error:string};if(!r.ok)throw Error(d.error);if(!controller.signal.aborted)setDaily(d)}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Не удалось загрузить отчёт')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[date,all,reload]);
 const report=daily;
 return <><section className="panel"><div className="panel-head"><div><h2>Отчёт магазина</h2><p>{all?'За всё время':'За выбранный день · 00:00–24:00, Бишкек'} · сом</p></div><div className="report-controls"><label>Дата<input type="date" value={date} min="2006-01-01" max="2100-12-31" disabled={all} onChange={e=>{followToday.current=false;setDate(e.target.value)}}/></label><button onClick={()=>{followToday.current=true;setDate(shopToday());setAll(false);setReload(v=>v+1)}}>Сегодня</button><button aria-pressed={all} onClick={()=>setAll(!all)}>{all?'За день':'За всё время'}</button></div></div>{error?<div className="alert" role="alert">{error}<button onClick={()=>setReload(v=>v+1)}>Повторить</button></div>:loading?<p className="report-loading">Загружаем отчёт…</p>:report&&<div className="report-list">{[['Количество продаж',report.sales],['Выручка',report.revenue],['Себестоимость проданного',report.cost],['Валовая прибыль',report.revenue-report.cost],['Стоимость списаний',report.loss],['Расходы',report.expenses],['Прибыль с учётом расходов',report.revenue-report.cost-report.loss-report.expenses],...(!all&&daily?[['Закупки за день',daily.purchases]]:[])].map(([label,value],i)=><div key={String(label)}><span>{label}</span><strong>{i===0?String(value):money(Number(value))}</strong></div>)}{!all&&daily&&daily.sales===0&&daily.receipts===0&&daily.writeoffs===0&&<p>За этот день операций пока нет.</p>}<p>Расчёт по сохранённым операциям, обновление при открытии и каждую минуту. Учитываются только расходы, внесённые в систему. Возвраты и отмены отражаются в день их оформления.</p></div>}</section></>
}


