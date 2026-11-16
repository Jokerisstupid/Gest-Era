import ts from 'typescript';
import fs from 'node:fs/promises';
export async function resolve(specifier,context,next){try{return await next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!specifier.endsWith('.ts'))return next(specifier+'.ts',context);throw error;}}
export async function load(url,context,next){if(url.endsWith('.ts')){const source=await fs.readFile(new URL(url),'utf8');return{format:'module',shortCircuit:true,source:ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,verbatimModuleSyntax:true}}).outputText};}return next(url,context);}
