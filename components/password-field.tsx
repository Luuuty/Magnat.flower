'use client';
import {useId,useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';
export default function PasswordField({label='Пароль',name='password',newPassword=false}:{label?:string;name?:string;newPassword?:boolean}){
 const [visible,setVisible]=useState(false);const id=useId();
 return <div className="password-field"><label htmlFor={id}>{label}</label><div className="password-input"><input id={id} name={name} type={visible?'text':'password'} autoComplete={newPassword?'new-password':'current-password'} required minLength={newPassword?12:1} maxLength={72}/><button type="button" aria-label={visible?'Скрыть '+label.toLowerCase():'Показать '+label.toLowerCase()} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={20}/>:<Eye size={20}/>}</button></div></div>
}
