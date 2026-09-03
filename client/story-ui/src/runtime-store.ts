import { access, cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import{validateCoreReceipt,type StoryCoreReceipt}from'./core-receipt.ts'

const SAFE_ID=/^[a-zA-Z0-9_-]{1,100}$/
const STABLE_ID=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/

function assertId(value:string,label:string):void{
  if(!SAFE_ID.test(value))throw new Error(`${label} 无效`)
}
function assertStableId(value:string,label:string):void{
  if(!STABLE_ID.test(value))throw new Error(`${label} 无效`)
}
function object(value:unknown,label:string):Record<string,unknown>{
  if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} 损坏`)
  return value as Record<string,unknown>
}

function replacePaths(value:unknown,source:string,target:string):unknown{
  if(typeof value==='string'){
    return value
      .replaceAll(source,target)
      .replaceAll(source.replaceAll('\\','/'),target.replaceAll('\\','/'))
  }
  if(Array.isArray(value))return value.map(item=>replacePaths(item,source,target))
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replacePaths(item,source,target)]))
  return value
}

/** Copies one session-scoped Story Engine runtime into an independent child. */
export class StoryRuntimeStore{
  constructor(private readonly root:string){}
  private directory(packId:string,sessionId:string):string{return join(this.root,packId,sessionId)}
  private statePath(packId:string,sessionId:string):string{return join(this.directory(packId,sessionId),'state.json')}

  /** Reads one authoritative D1 receipt without mutating or normalizing Runtime state. */
  async readReceipt(packId:string,sessionId:string,operationId:string):Promise<StoryCoreReceipt|undefined>{
    assertId(packId,'内容包 ID');assertId(sessionId,'会话 ID');assertStableId(operationId,'operationId')
    let state:unknown
    try{state=JSON.parse(await readFile(this.statePath(packId,sessionId),'utf8'))as unknown}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error}
    const root=object(state,'Story Runtime state')
    const engine=object(root._engine,'Story Runtime _engine')
    const schemaVersion=Number(engine.schemaVersion)
    if(!Number.isSafeInteger(schemaVersion)||schemaVersion<2||schemaVersion>3)throw new Error(`Story Runtime schemaVersion 不受支持：${String(engine.schemaVersion)}`)
    if(engine.operationReceipts===undefined)return undefined
    const receipts=object(engine.operationReceipts,'Story Runtime operationReceipts')
    const found=receipts[operationId]
    return found===undefined?undefined:validateCoreReceipt(found,operationId)
  }

  async clone(packId:string,sourceSessionId:string,targetSessionId:string):Promise<boolean>{
    assertId(packId,'内容包 ID');assertId(sourceSessionId,'源会话 ID');assertId(targetSessionId,'目标会话 ID')
    if(sourceSessionId===targetSessionId)throw new Error('源会话与目标会话不能相同')
    const source=this.directory(packId,sourceSessionId)
    const target=this.directory(packId,targetSessionId)
    try{await access(source)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error}
    try{await access(target);throw new Error('目标剧情状态已存在')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
    const temporary=`${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
    await mkdir(dirname(target),{recursive:true})
    try{
      await cp(source,temporary,{recursive:true,errorOnExist:true,force:false})
      const statePath=join(temporary,'state.json')
      const state=JSON.parse(await readFile(statePath,'utf8'))as unknown
      await writeFile(statePath,`${JSON.stringify(replacePaths(state,source,target),null,2)}\n`,'utf8')
      await rename(temporary,target)
      return true
    }finally{
      await rm(temporary,{recursive:true,force:true})
    }
  }
}
