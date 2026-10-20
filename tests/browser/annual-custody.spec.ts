import {test,expect} from '@playwright/test';
import {fixture,testDb} from '../fixtures';
import {randomToken,sha256,sign} from '../../lib/security';
test.afterAll(()=>testDb.$disconnect());

test('แอดมินต้องดาวน์โหลดและระบุที่เก็บ ก่อนยืนยันรับผิดชอบรายงาน',async({page})=>{
  const f=await fixture(),token=randomToken(),csrf=randomToken();
  await testDb.authSession.create({data:{userId:f.admin.id,tokenHash:sha256(sign(token)),csrfToken:csrf,expiresAt:new Date(Date.now()+600000)}});
  await page.context().addCookies([{name:'management_session',value:token,url:'http://127.0.0.1:3001',httpOnly:true,sameSite:'Lax'}]);
  const api=(path:string,data:Record<string,unknown>)=>page.request.post(path,{headers:{Origin:'http://127.0.0.1:3001','x-csrf-token':csrf,Accept:'application/json'},data});
  await page.goto('/admin/retention');
  await expect(page.getByText('แอดมินยืนยันเองทุกขั้นตอน',{exact:true})).toBeVisible();
  await expect(page.locator('select[name="autoDelete"]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'ลบข้อมูลของปีนี้ถาวร',exact:true})).toBeDisabled();
  const created=await api(`/api/admin/retention/${f.year.id}/archive`,{});expect(created.status()).toBe(200);
  const archive=await testDb.archiveManifest.findFirstOrThrow({where:{fiscalYearId:f.year.id}});
  // The real restore/checksum flow is tested in annual-custody.integration.ts.
  await testDb.archiveManifest.update({where:{id:archive.id},data:{restoreTestedAt:new Date(),restoreEvidence:{test:'synthetic browser fixture'}}});
  expect((await api(`/api/admin/archives/${archive.id}/receive`,{confirmation:'1',storageLocation:'Unit drive / annual backup.zip'})).status()).toBe(422);
  const download=await page.request.get('/api/admin/archives/'+archive.id);expect(download.status()).toBe(200);expect((await download.body()).subarray(0,2).toString()).toBe('PK');
  await page.goto('/admin/retention');
  const panel=page.locator('details.editor').filter({has:page.locator(':scope > summary',{hasText:archive.id})});
  await panel.locator(':scope > summary').click();
  await panel.getByLabel('ที่เก็บ ZIP และรายงานภายนอกระบบ').fill('Unit drive / annual backup.zip');
  await panel.getByRole('checkbox').first().check();
  await panel.getByRole('button',{name:'ยืนยันแอดมินรับผิดชอบเก็บไฟล์',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/retention/);
  const saved=await testDb.archiveManifest.findUniqueOrThrow({where:{id:archive.id}});
  expect(saved.receivedBy).toBe(f.admin.id);
  expect(JSON.stringify(saved.restoreEvidence)).toContain('Unit drive / annual backup.zip');
  expect(saved.data).not.toBeNull();
  // No data or files are removed just by acknowledging custody.
  expect(await testDb.trainingParticipation.count()).toBe(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
