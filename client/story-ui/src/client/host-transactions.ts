import{createPreparedTransaction,validateTransactionRecord,type StoryTransactionRecord}from'../transaction-journal.ts'

const TERMINAL=new Set(['committed','cancelled','failed'])
export class HostTransactionJournal{
 private readonly tails=new Map<string,Promise<void>>()
 constructor(private readonly fetcher:typeof fetch=(input,init)=>fetch(input,init)){}
 private key(saveId:string,transactionId:string):string{return`${saveId}:${transactionId}`}
 private base(saveId:string):string{return`/story-engine/api/transactions/${encodeURIComponent(saveId)}`}
 private endpoint(saveId:string,transactionId:string):string{return`${this.base(saveId)}/${encodeURIComponent(transactionId)}`}
 private serial<T>(saveId:string,transactionId:string,work:()=>Promise<T>):Promise<T>{const key=this.key(saveId,transactionId);const previous=this.tails.get(key)??Promise.resolve();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve});const queued=previous.then(()=>gate);this.tails.set(key,queued);const task=previous.then(work);return task.finally(()=>{release();if(this.tails.get(key)===queued)this.tails.delete(key)})}
 async list(saveId:string):Promise<StoryTransactionRecord[]>{const response=await this.fetcher(this.base(saveId),{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`读取 transaction journal 失败：${response.status}`);const body=await response.json()as{transactions?:unknown};if(!Array.isArray(body.transactions))throw new Error('transaction journal 列表格式无效');return body.transactions.map(validateTransactionRecord)}
 async listOpen(saveId:string):Promise<StoryTransactionRecord[]>{return(await this.list(saveId)).filter(record=>!TERMINAL.has(record.status))}
 async load(saveId:string,transactionId:string):Promise<StoryTransactionRecord|undefined>{const response=await this.fetcher(this.endpoint(saveId,transactionId),{headers:{accept:'application/json'}});if(response.status===204||response.status===404)return undefined;if(!response.ok)throw new Error(`读取 transaction 失败：${response.status}`);return validateTransactionRecord(await response.json())}
 save(record:StoryTransactionRecord,bootstrap=false):Promise<StoryTransactionRecord>{return this.serial(record.saveId,record.transactionId,async()=>{const response=await this.fetcher(this.endpoint(record.saveId,record.transactionId),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:bootstrap?-1:record.revision-1,transaction:record})});if(response.status===409){const detail=await response.json().catch(()=>({}))as{error?:string};throw new Error(detail.error??'transaction journal 发生幂等或版本冲突，请重新读取后恢复')};if(!response.ok){const detail=await response.json().catch(()=>({}))as{error?:string};throw new Error(detail.error??`保存 transaction 失败：${response.status}`)}return validateTransactionRecord(await response.json())})}
 async prepare(input:{transactionId?:string;saveId:string;channelId:string;text:string;baseProjectionRevision:number;now?:Date}):Promise<StoryTransactionRecord>{const record=await createPreparedTransaction(input);return this.save(record,true)}
}
