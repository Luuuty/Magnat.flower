export const backupColumns={
 products:['id','name','category','stock','cost','price','minimum'],
 recipes:['id','name','price'],
 parts:['recipe_id','product_id','quantity'],
 documents:['id','kind','created','actor','note','summary','revenue','fingerprint','reverse_of','expense','effect_cost','effect_loss','effect_purchases'],
 movements:['id','document_id','product_id','quantity','cost'],
 users:['id','username','name','password_hash','role','active','created','phone','recovery_hash'],
} as const;
export const backupVersion=2;

