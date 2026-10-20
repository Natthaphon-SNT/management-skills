import {test,expect} from '@playwright/test';
import {fixture,testDb} from '../fixtures';
import {randomToken,sha256,sign} from '../../lib/security';

test.afterAll(()=>testDb.$disconnect());
test('นำออกและกู้คืนฐานประจำปี โดยเก็บรายงานการอบรม',async({page})=>{
  const f=await fixture(),token=randomToken();
  await testDb.authSession.create({data:{userId:f.admin.id,tokenHash:sha256(sign(token)),csrfToken:randomToken(),expiresAt:new Date(Date.now()+600000)}});
  await page.context().addCookies([{name:'management_session',value:token,url:'http://127.0.0.1:3001',httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/admin');
  const included=page.locator('#scopes > details').filter({has:page.locator(':scope > summary',{hasText:f.user.name})});
  await included.locator(':scope > summary').click();
  await included.getByText('ลบออกจากฐานปีนี้',{exact:true}).click();
  const removal=included.locator('form[action$="/delete"]');
  await removal.getByLabel('เหตุผลการนำออก').fill('ทดสอบนำออกจากฐานประเมิน');
  await removal.getByLabel('พิมพ์ DELETE').fill('DELETE');
  await removal.getByRole('button',{name:'นำออกจากฐานปีนี้',exact:true}).click();
  await expect(page.locator('#scopes > details > summary').filter({hasText:f.user.name})).toHaveCount(0);
  await page.getByText('บุคลากรที่นำออกจากฐานประจำปี (1)',{exact:true}).click();
  const excluded=page.locator('#scopes details details').filter({has:page.locator(':scope > summary',{hasText:f.user.name})});
  await excluded.locator(':scope > summary').click();
  await excluded.getByLabel('ขอบเขตประเมิน').selectOption('1');
  await excluded.getByLabel('หลักเกณฑ์ / เหตุผล').fill('กู้คืนฐานประเมิน');
  await excluded.getByRole('button',{name:'บันทึกฐานประเมิน',exact:true}).click();
  await expect(page.locator('#scopes > details > summary').filter({hasText:f.user.name})).toHaveCount(1);
  expect(await testDb.trainingParticipation.count()).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
