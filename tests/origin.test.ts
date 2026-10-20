import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkOrigin,requestOrigin} from '../lib/security';
test('origin และ redirect ใช้ Host ภายนอกเมื่อ Next ใช้ localhost ภายใน',()=>{
  const request=new Request('http://localhost:3001/api/plans',{headers:{host:'127.0.0.1:3001',origin:'http://127.0.0.1:3001'}});
  assert.equal(requestOrigin(request),'http://127.0.0.1:3001');
  assert.doesNotThrow(()=>checkOrigin(request));
  assert.throws(()=>checkOrigin(new Request(request,{headers:{host:'127.0.0.1:3001',origin:'https://other.example'}})));
  assert.throws(()=>checkOrigin(new Request(request,{headers:{host:'127.0.0.1:3001'}})));
});
