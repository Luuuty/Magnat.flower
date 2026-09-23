import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:'Magnat Flower — учёт магазина',description:'Внутренняя система учёта: склад, букеты, продажи и отчёты.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>}
