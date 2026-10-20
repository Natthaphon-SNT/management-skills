import {test,expect} from '@playwright/test';
import {fixture,testDb} from '../fixtures';
import {randomToken,sha256,sign} from '../../lib/security';

test.afterAll(()=>testDb.$disconnect());
test('แก้สิทธิ์ผ่านฟอร์มจริง USER เป็น ADMIN และกลับเป็น USER',async({page})=>{
  const f=await fixture(),token=randomToken();
  await testDb.authSession.create({data:{userId:f.admin.id,tokenHash:sha256(sign(token)),csrfToken:randomToken(),expiresAt:new Date(Date.now()+600000)}});
  await page.context().addCookies([{name:'management_session',value:token,url:'http://127.0.0.1:3001',httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/admin');
  const account=page.locator('#accounts details').filter({has:page.locator('summary strong',{hasText:'tester'})});
  await account.locator(':scope > summary').click();
  await expect(account.locator('select[name=personId]')).toHaveCount(0);
  await account.getByLabel('สิทธิ์บัญชี').selectOption('ADMIN');
  await account.getByRole('button',{name:'บันทึกสิทธิ์และอีเมล'}).click();
  await expect(page.getByRole('status').filter({hasText:'บันทึกข้อมูลแล้ว'})).toBeVisible();
  expect((await testDb.user.findUniqueOrThrow({where:{id:f.user.id}})).role).toBe('ADMIN');
  await account.locator(':scope > summary').click();
  await expect(account.getByLabel('สิทธิ์บัญชี')).toHaveValue('ADMIN');
  await account.getByLabel('สิทธิ์บัญชี').selectOption('USER');
  await account.getByRole('button',{name:'บันทึกสิทธิ์และอีเมล'}).click();
  await expect(page.getByRole('status').filter({hasText:'บันทึกข้อมูลแล้ว'})).toBeVisible();
  expect((await testDb.user.findUniqueOrThrow({where:{id:f.user.id}})).role).toBe('USER');
});

test('แก้สิทธิ์บัญชีรออนุมัติได้โดยไม่กรอกทะเบียน และอนุมัติแยกภายหลัง',async({page})=>{
  const f=await fixture(),token=randomToken();
  const pending=await testDb.user.create({data:{username:'pending_role',name:'สมาชิกทดสอบ',passwordHash:f.user.passwordHash}});
  await testDb.authSession.create({data:{userId:f.admin.id,tokenHash:sha256(sign(token)),csrfToken:randomToken(),expiresAt:new Date(Date.now()+600000)}});
  await page.context().addCookies([{name:'management_session',value:token,url:'http://127.0.0.1:3001',httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/admin');
  const account=page.locator('#accounts details').filter({has:page.locator('summary strong',{hasText:'pending_role'})});
  await account.locator(':scope > summary').click();
  await account.getByLabel('สิทธิ์บัญชี').selectOption('ADMIN');
  await account.getByLabel('อีเมลสำหรับแจ้งเตือน ADMIN').fill('admin@example.invalid');
  await account.getByRole('button',{name:'บันทึกสิทธิ์และอีเมล'}).click();
  await expect(page.getByRole('status').filter({hasText:'บันทึกข้อมูลแล้ว'})).toBeVisible();
  let saved=await testDb.user.findUniqueOrThrow({where:{id:pending.id}});
  expect(saved.role).toBe('ADMIN');expect(saved.email).toBe('admin@example.invalid');expect(saved.approvedAt).toBeNull();expect(saved.personId).toBeNull();
  await account.locator(':scope > summary').click();
  await expect(account.getByLabel('เชื่อมทะเบียนบุคลากร').locator(`option[value="${f.user.personId}"]`)).toHaveCount(0);
  await account.getByLabel('เชื่อมทะเบียนบุคลากร').selectOption(f.persons[2].id);
  await account.getByRole('button',{name:'เชื่อมทะเบียนและอนุมัติบัญชี'}).click();
  await expect(page.getByRole('status').filter({hasText:'บันทึกข้อมูลแล้ว'})).toBeVisible();
  saved=await testDb.user.findUniqueOrThrow({where:{id:pending.id}});
  expect(saved.personId).toBe(f.persons[2].id);expect(saved.approvedAt).not.toBeNull();expect(saved.role).toBe('ADMIN');expect(saved.email).toBe('admin@example.invalid');
});

test('ปุ่มทดสอบอีเมลใช้ผู้รับของแอดมินที่เลือกและแสดงสถานะจริง',async({page})=>{
  const f=await fixture(),token=randomToken();
  await testDb.user.update({where:{id:f.user.id},data:{role:'ADMIN',email:'second@example.invalid'}});
  await testDb.authSession.create({data:{userId:f.admin.id,tokenHash:sha256(sign(token)),csrfToken:randomToken(),expiresAt:new Date(Date.now()+600000)}});
  await page.context().addCookies([{name:'management_session',value:token,url:'http://127.0.0.1:3001',httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/admin');
  const account=page.locator('#accounts details').filter({has:page.locator('summary strong',{hasText:'tester'})});
  await account.locator(':scope > summary').click();
  await account.getByRole('button',{name:'ทดสอบส่งอีเมล',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'ดำเนินการทดสอบอีเมลแล้ว'})).toBeVisible();
  // SMTP is explicitly disabled in the browser-test server, even when production env exists.
  await expect.poll(async()=>(await testDb.notification.findFirst({where:{userId:f.user.id,channel:'email',idempotencyKey:{startsWith:'email-test:'}}}))?.status).toBe('failed');
  expect(await testDb.notification.count({where:{userId:f.admin.id,idempotencyKey:{startsWith:'email-test:'}}})).toBe(0);
  await page.reload();await account.locator(':scope > summary').click();
  await expect(account).toContainText('อีเมลล่าสุด: ส่งไม่สำเร็จ');
  await expect(account).toContainText('SMTP/MAIL_FROM');
});
