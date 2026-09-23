import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync,renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {backupColumns,backupVersion} from '../lib/backup-format.ts';
const [input,targetArg]=process.argv.slice(2);
if(!input||!targetArg)throw Error('Usage: node scripts/restore-backup.mjs backup.json NEW-database.sqlite');
const target=path.resolve(targetArg),temporary=target+'.restoring';
if(existsSync(target)||existsSync(temporary))throw Error('Output must be a new file. Existing databases are never overwritten.');
const backup=JSON.parse(readFileSync(input,'utf8'));
if(backup.format!=='magnat-flower-backup'||![1,backupVersion].includes(backup.version)||backup.currency!=='KGS'||!backup.tables)throw Error('Unsupported backup format.');
if(backup.version===1&&Array.isArray(backup.tables.documents))backup.tables.documents=backup.tables.documents.map(row=>({...row,reverse_of:null,expense:0,effect_cost:null,effect_loss:null,effect_purchases:null}));
for(const [name,columns]of Object.entries(backupColumns)){
 const rows=backup.tables[name];if(!Array.isArray(rows))throw Error('Missing table: '+name);
 for(const row of rows){if(!row||typeof row!=='object'||Object.keys(row).length!==columns.length||columns.some(c=>!(c in row))||Object.values(row).some(v=>v!==null&&typeof v!=='string'&&(typeof v!=='number'||!Number.isSafeInteger(v))))throw Error('Invalid row in '+name);}
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const db=new DatabaseSync(temporary);
try{
 db.exec('PRAGMA foreign_keys=ON');
 for(const migration of ['0000_nostalgic_jackal.sql','0001_ambitious_hex.sql','0002_nostalgic_hellcat.sql','0003_fearless_jamie_braddock.sql'])db.exec(readFileSync(path.join(root,'drizzle',migration),'utf8'));
 db.exec('BEGIN');
 for(const [name,columns]of Object.entries(backupColumns)){
  const insert=db.prepare(`INSERT INTO ${name} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
  for(const row of backup.tables[name])insert.run(...columns.map(c=>row[c]));
 }
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Broken references in backup');
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Integrity check failed');
 db.exec('COMMIT');db.close();renameSync(temporary,target);console.log('Backup restored and verified: '+target);
}catch(error){try{db.close()}catch{}try{unlinkSync(temporary)}catch{}throw error}

