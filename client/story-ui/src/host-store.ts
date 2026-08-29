import{mkdir,readFile,readdir,rename,rm,writeFile}from'node:fs/promises'
import{basename,dirname,join}from'node:path'
type JsonObject=Record<string,any>
function safe(id:string):string{return basename(id.replace(/[^a-zA-Z0-9_-]/g,'_')).slice(0,100)||'default'}
export interface SaveSummary{saveId:string;packId:string;packTitle:string;revision:number;updatedAt:string;sceneLabel:string}
function summaryOf(value:JsonObject):SaveSummary{return{saveId:String(value.saveId),packId:String(value.packId??'unknown'),packTitle:String(value.packTitle??'未命名存档'),revision:Number(value.revision??0),updatedAt:String(value.updatedAt??''),sceneLabel:String(value.frame?.sceneLabel??'')}}
export class StoryProjectionStore{
 private readonly queues=new Map<string,Promise<void>>()
 constructor(private readonly root:string){}
 private directory():string{return join(this.root,'social-saves')}
 private path(id:string):string{return join(this.directory(),`${safe(id)}.json`)}
 private async exclusive<T>(id:string,work:()=>Promise<T>):Promise<T>{const previous=this.queues.get(id)??Promise.resolve();let release!:()=>void;const current=new Promise<void>(resolve=>{release=resolve});const queued=previous.then(()=>current);this.queues.set(id,queued);await previous;try{return await work()}finally{release();if(this.queues.get(id)===queued)this.queues.delete(id)}}
 async read(id:string):Promise<JsonObject|undefined>{try{return JSON.parse(await readFile(this.path(id),'utf8'))as JsonObject}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error}}
 async list():Promise<SaveSummary[]>{
  const names=await readdir(this.directory()).catch(error=>{if((error as NodeJS.ErrnoException).code==='ENOENT')return[]as string[];throw error})
  const summaries:SaveSummary[]=[]
  for(const name of names){if(!name.endsWith('.json'))continue;try{const value=await this.read(name.slice(0,-5));if(value!==undefined)summaries.push(summaryOf(value))}catch{/* skip unreadable save */}}
  return summaries.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
 }
 async write(id:string,expectedRevision:number,value:JsonObject):Promise<JsonObject>{return this.exclusive(id,async()=>{const current=await this.read(id);const revision=current===undefined?-1:Number(current.revision);if(revision!==expectedRevision)throw new Error(`存档版本冲突：当前 ${revision}，提交基于 ${expectedRevision}`);if(value.saveId!==id||!Number.isInteger(value.revision)||(current!==undefined&&Number(value.revision)!==expectedRevision+1))throw new Error('存档 ID 或新版本无效');const path=this.path(id);await mkdir(dirname(path),{recursive:true});const temporary=`${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`,'utf8');await rename(temporary,path);return value})}
 /** Remove one save. Returns false when the save did not exist. */
 async remove(id:string):Promise<boolean>{return this.exclusive(id,async()=>{try{await rm(this.path(id));return true}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error}})}
}
