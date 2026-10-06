/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
fs.cpSync(path.join(root,'.next/static'),path.join(root,'.next/standalone/.next/static'),{recursive:true});
if(fs.existsSync(path.join(root,'public')))
    fs.cpSync(path.join(root,'public'),path.join(root,'.next/standalone/public'),{recursive:true});
