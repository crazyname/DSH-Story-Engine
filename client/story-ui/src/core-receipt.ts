const STABLE_ID=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/
const SHA256=/^[a-f0-9]{64}$/

export interface StoryCoreReceipt{
  operationId:string
  transactionId?:string
  operation:string
  fingerprint:string
  stateVersion:number
  committedAt:string
  result:unknown
}

function object(value:unknown,label:string):Record<string,unknown>{
  if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} 损坏`)
  return value as Record<string,unknown>
}

export function validateCoreReceipt(value:unknown,expectedOperationId?:string):StoryCoreReceipt{
  const raw=object(value,'Core operation receipt')
  const operationId=raw.operationId
  if(typeof operationId!=='string'||!STABLE_ID.test(operationId)||(expectedOperationId!==undefined&&operationId!==expectedOperationId)||typeof raw.operation!=='string'||raw.operation.length===0||typeof raw.fingerprint!=='string'||!SHA256.test(raw.fingerprint)||!Number.isSafeInteger(raw.stateVersion)||Number(raw.stateVersion)<0||typeof raw.committedAt!=='string'||Number.isNaN(Date.parse(raw.committedAt))||!Object.prototype.hasOwnProperty.call(raw,'result'))throw new Error(`Core operation receipt 损坏${expectedOperationId===undefined?'':`：${expectedOperationId}`}`)
  const transactionId=raw.transactionId
  if(transactionId!==undefined&&(typeof transactionId!=='string'||!STABLE_ID.test(transactionId)))throw new Error(`Core operation receipt transactionId 损坏：${operationId}`)
  return{operationId,...(transactionId===undefined?{}:{transactionId}),operation:raw.operation,fingerprint:raw.fingerprint,stateVersion:Number(raw.stateVersion),committedAt:raw.committedAt,result:structuredClone(raw.result)}
}
