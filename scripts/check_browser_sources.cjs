/* Portable PR check: no browser, private environment or API credentials required. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context=vm.createContext({window:{}});
for(const file of ['modules.js','templates.js'])vm.runInContext(fs.readFileSync(path.join(root,'site',file),'utf8'),context,{filename:file});
const norm=x=>x.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();let failures=[];
for(const [key,fn] of Object.entries(context.window.__yx_modules)){
 const text=fn.toString(),body=text.slice(text.indexOf('{')+1,text.lastIndexOf('}'));
 if(norm(body)!==norm(fs.readFileSync(path.join(root,'miniprogram',key),'utf8')))failures.push(key);
}
for(const [key,value] of Object.entries(context.window.__yx_templates))if(norm(value)!==norm(fs.readFileSync(path.join(root,'miniprogram',key+'.wxml'),'utf8')))failures.push(key+'.wxml');
console.log('BROWSER_SOURCE_SYNC',failures.length===0?'PASS':'FAIL',Object.keys(context.window.__yx_modules).length,'modules',Object.keys(context.window.__yx_templates).length,'templates');
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
