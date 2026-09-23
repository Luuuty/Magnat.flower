import {env} from 'cloudflare:workers';
export function database(){if(!env.DB)throw Error('DATABASE_UNAVAILABLE');return env.DB;}
