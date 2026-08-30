import { describe, expect, it } from 'vitest'
import { operationFingerprint, prepareOperation } from './operation-idempotency.js'

describe('operation idempotency primitives',()=>{
  it('uses canonical object ordering for stable fingerprints',()=>{
    const identity={operationId:'op-stable-001',transactionId:'tx-stable-001'}
    const a=operationFingerprint('story_commit_state',identity,{changes:{b:2,a:1},reason:'same'})
    const b=operationFingerprint('story_commit_state',identity,{reason:'same',changes:{a:1,b:2}})
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })
  it('changes the fingerprint when semantic payload or transaction identity changes',()=>{
    const base=operationFingerprint('story_commit_state',{operationId:'op-diff-001',transactionId:'tx-a'},{changes:{a:1}})
    expect(operationFingerprint('story_commit_state',{operationId:'op-diff-001',transactionId:'tx-a'},{changes:{a:2}})).not.toBe(base)
    expect(operationFingerprint('story_commit_state',{operationId:'op-diff-001',transactionId:'tx-b'},{changes:{a:1}})).not.toBe(base)
  })
  it('rejects unstable ids instead of silently normalizing them',()=>{
    expect(()=>prepareOperation('story_commit_state',{operationId:' bad id '},{changes:{a:1}})).toThrow('operationId 无效')
    expect(()=>prepareOperation('story_commit_state',{operationId:'valid-op',transactionId:'bad transaction'},{changes:{a:1}})).toThrow('transactionId 无效')
  })
})
