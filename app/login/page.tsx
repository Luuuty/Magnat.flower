import {redirect} from 'next/navigation';
import {currentUser,hasOwner} from '@/lib/auth';
import {requireChatGPTUser} from '../chatgpt-auth';
import LoginForm from './form';
export const dynamic='force-dynamic';
export default async function Login(){if(await currentUser())redirect('/');const setup=!await hasOwner();if(setup)await requireChatGPTUser('/login');return <LoginForm setup={setup}/>}
