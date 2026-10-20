import {test,expect} from '@playwright/test';
import {fixture,testDb} from '../fixtures';
import {randomToken,sha256,sign} from '../../lib/security';
test.afterAll(()=>testDb.$disconnect());

for(const role of ['user','admin'] as const)test(`คู่มือ ${role} มีเมนู สารบัญ ภาพจริง และไม่ล้นหน้าจอ`,async({page})=>{
  const f=await fixture(),token=randomToken();
  await testDb.authSession.create({data:{userId:f[role].id,tokenHash:sha256(sign(token)),csrfToken:randomToken(),expiresAt:new Date(Date.now()+600000)}});
  await page.context().addCookies([{name:'management_session',value:token,url:'http://127.0.0.1:3001',httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/dashboard');
  await page.getByRole('link',{name:'คู่มือการใช้งาน',exact:true}).click();
  await expect(page).toHaveURL('/manual');
  await expect(page.getByRole('heading',{name:'คู่มือการใช้งานระบบ',exact:true})).toBeVisible();
  await expect(page.locator('.manual-intro')).toContainText(role==='admin'?'สำหรับผู้ดูแลระบบ':'สำหรับผู้ใช้งานทั่วไป');
  const toc=page.getByRole('navigation',{name:'สารบัญคู่มือ'});
  for(const href of await toc.locator('a').evaluateAll(links=>links.map(a=>a.getAttribute('href')!)))expect(await page.locator(href).count()).toBe(1);
  const pictures=page.locator('.manual figure img');
  expect(await pictures.count()).toBeGreaterThanOrEqual(5);
  for(const picture of await pictures.all()){
    await picture.scrollIntoViewIfNeeded();
    await expect(picture).toBeVisible();
    await expect.poll(()=>picture.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
    expect(await picture.getAttribute('alt')).toBeTruthy();
  }
  await toc.getByRole('link',{name:'แก้ปัญหาที่พบบ่อย'}).click();
  await expect(page).toHaveURL(/#guide-help$/);
  await page.getByText('บันทึกแล้วแต่หาอบรมไม่เจอ',{exact:true}).click();
  await expect(page.locator('#guide-help details').first()).toHaveAttribute('open','');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:`test-results/manual-${role}-${test.info().project.name}-dark.png`,fullPage:false});
  if(role==='admin'){
    await page.getByRole('link',{name:'คู่มือผู้ใช้งานทั่วไป',exact:true}).click();
    await expect(page.getByRole('heading',{name:'สมัครสมาชิกและเข้าสู่ระบบ',exact:true})).toBeVisible();
  }else{
    await page.goto('/manual?audience=admin');
    await expect(page.getByRole('heading',{name:'สมัครสมาชิกและเข้าสู่ระบบ',exact:true})).toBeVisible();
    await expect(page.getByRole('link',{name:'คู่มือผู้ดูแลระบบ',exact:true})).toHaveCount(0);
  }
});
test('คู่มือต้องเข้าสู่ระบบก่อน',async({page})=>{await page.goto('/manual');await expect(page).toHaveURL(/\/login/);});
