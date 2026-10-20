import {test,expect} from '@playwright/test';
import {fixture,testDb} from '../fixtures';
import {randomToken,sha256,sign} from '../../lib/security';
test.afterAll(()=>testDb.$disconnect());
test('ไม่มีแผนในเมนู ฟอร์ม KPI หรือส่งออก และปิดเส้นทางเดิม โดยเก็บข้อมูลเก่า',async({page})=>{
  const f=await fixture(),token=randomToken(),csrf=randomToken();
  await testDb.authSession.create({data:{userId:f.admin.id,tokenHash:sha256(sign(token)),csrfToken:csrf,expiresAt:new Date(Date.now()+600000)}});
  await page.context().addCookies([{name:'management_session',value:token,url:'http://127.0.0.1:3001',httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/dashboard');
  await expect(page.locator('nav a[href^="/plans"]')).toHaveCount(0);
  await expect(page.locator('[data-kpi]')).toHaveCount(4);
  await expect(page.locator('[data-kpi="A"],[data-kpi="C"]')).toHaveCount(0);
  await expect(page.locator('[name="kind"] option[value="idp"]')).toHaveCount(0);
  // Next may send status 200 when a not-found boundary is streamed after layout.
  for(const path of ['/plans','/plans/'+f.plan.id]){
    await page.goto(path);
    await expect(page.getByRole('heading',{name:'ไม่พบหน้าหรือข้อมูลที่ต้องการ'})).toBeVisible();
    await expect(page.locator('form[action^="/api/plans"]')).toHaveCount(0);
  }
  for(const path of ['/api/plans','/api/plans/'+f.plan.id+'/save','/api/plans/'+f.plan.id+'/items']){
    const response=await page.request.post(path,{headers:{Origin:'http://127.0.0.1:3001',Accept:'application/json','x-csrf-token':csrf},data:{title:'ไม่ควรบันทึก'}});
    expect(response.status()).toBe(404);
  }
  const denied=await page.request.post('/api/exports',{headers:{Origin:'http://127.0.0.1:3001',Accept:'application/json','x-csrf-token':csrf},data:{kind:'idp',format:'xlsx'}});
  expect(denied.status()).toBe(422);
  await page.goto('/trainings/'+f.participations[0].id+'/edit');
  await expect(page.locator('[name="planItemId"]')).toHaveCount(0);
  await page.goto('/admin');await expect(page.locator('[name="idpStatus"]')).toHaveCount(0);
  expect(await testDb.developmentPlan.count()).toBe(1);
  expect(await testDb.planItem.count()).toBe(2);
});
