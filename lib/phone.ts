export function normalizePhone(value:unknown):string|null {
 if(typeof value!=='string')return null;
 const clean=value.trim().replace(/[\s()\-]/g,'');
 if(/^0\d{9}$/.test(clean))return '+996'+clean.slice(1);
 if(/^996\d{9}$/.test(clean))return '+'+clean;
 return /^\+[1-9]\d{7,14}$/.test(clean)?clean:null;
}
