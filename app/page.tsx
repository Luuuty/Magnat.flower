import Workspace from './workspace';
import {currentUser} from '@/lib/auth';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page(){const user=await currentUser();if(!user)redirect('/login');return <Workspace user={user}/>}
