import {test,expect,type Page} from '@playwright/test';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import {fixture,testDb,testPassword} from '../fixtures';
import {day} from '../../lib/calendar';
let f:Awaited<ReturnType<typeof fixture>>;
test.beforeEach(async()=>{f=await fixture();});
test.afterAll(()=>testDb.$disconnect());
async function login(page:Page,username='admin') {
  await page.goto('/login');await page.getByLabel('Username').fill(username);await page.getByLabel('Password').fill(testPassword);await expect(page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true})).toBeEnabled();await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();await expect(page).toHaveURL(/\/dashboard$/);await expect(page.getByRole('heading',{name:'ภาพรวมการพัฒนาบุคลากร'})).toBeVisible();
}
async function api(page:Page,path:string,data:Record<string,unknown>,method='POST') {
  const token=await (await page.request.get('/api/auth/csrf')).json();return page.request.fetch(path,{method,headers:{Origin:'http://127.0.0.1:3001','x-csrf-token':token.csrf,Accept:'application/json'},data});
}
function payload(overrides:Record<string,unknown>={}) {return {personId:f.user.personId,fiscalYearId:f.year.id,quarter:1,startsOn:f.trainingDate,endsOn:f.trainingDate,organizer:'ผู้จัดสมมติ',title:'รายการจาก E2E',location:'สถานที่สมมติ',category:'professional',hours:2,status:'completed',reportDueOn:f.trainingDate,...overrides};}

test('เข้าสู่ระบบ production, cookie ปลอดภัย, KPI ตรงชุดคำนวณมือ และ responsive',async({page},info)=> {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await login(page);
  const cookies=await page.context().cookies();const session=cookies.find(c=>c.name==='management_session');expect(session?.secure).toBe(true);expect(session?.httpOnly).toBe(true);expect(session?.sameSite).toBe('Lax');
  const response=await page.request.get('/api/dashboard');expect(response.ok()).toBeTruthy();const report=await response.json();expect(report.summary.population).toBe(3);expect(report.summary.completed).toBe(2);expect(report.summary.developedPeople).toBe(1);
  const expected={A:33.33,B:33.33,C:50,D:50,E:50,F:3.33};for(const k of report.kpis){expect(k.actual).toBe(expected[k.code as keyof typeof expected]);expect(k.target).toBeNull();expect(k.status).toBe('ยังไม่ได้กำหนดเป้าหมาย');}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'สลับธีมสว่างและมืด'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.getByRole('button',{name:'สลับธีมสว่างและมืด'}).click();
  await page.screenshot({path:`../.tools/next-${info.project.name}.png`,fullPage:true});expect(errors).toEqual([]);
});
test('USER อ่านและแก้ข้อมูลคนอื่นผ่าน API ไม่ได้ และไม่มีเมนู ADMIN',async({page})=> {
  await login(page,'tester');await expect(page.getByRole('link',{name:'ทะเบียนและการตั้งค่า'})).toHaveCount(0);
  const denied=await api(page,'/api/trainings',payload({personId:f.admin.personId}));expect(denied.status()).toBe(403);
  expect((await page.request.get('/api/dashboard?personId='+f.admin.personId)).status()).toBe(403);
  expect((await api(page,'/api/admin/years',{year:f.year.year+1})).status()).toBe(403);
  const report=await (await page.request.get('/api/trainings')).json();expect(new Set(report.rows.map((r:{personId:string})=>r.personId))).toEqual(new Set([f.user.personId]));
});
test('ADMIN บันทึกให้ตนเอง/คนอื่นได้พร้อม audit และ refresh แล้วยังอยู่',async({page})=> {
  await login(page);for(const personId of [f.admin.personId,f.user.personId]){const response=await api(page,'/api/trainings',payload({personId}));expect(response.status(),await response.text()).toBe(201);const {id}=await response.json();expect(await testDb.auditLog.count({where:{entityId:id,actorId:f.admin.id,ownerId:personId}})).toBe(1);await page.goto('/trainings/'+id);await expect(page.getByRole('heading',{name:'รายการจาก E2E'})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'รายการจาก E2E'})).toBeVisible();}
});
test('ปฏิทินจำกัดไตรมาสและบล็อกวันสิ้นสุดก่อนเริ่มทั้งหน้าเว็บและ API',async({page})=> {
  await login(page);await page.goto('/trainings/create');await page.getByLabel('วันที่เริ่ม').fill(f.trainingDate);await page.getByLabel('วันที่เริ่ม').blur();await expect(page.locator('select[name=quarter]')).toHaveValue('1');
  await page.getByLabel('วันที่สิ้นสุด').fill(day(new Date(+new Date(f.trainingDate+'T00:00:00Z')-86400000)));await expect(page.locator('[data-date-error]')).toHaveText('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');await expect(page.getByRole('button',{name:'บันทึกการอบรม',exact:true})).toBeDisabled();
  await page.getByLabel('วันที่สิ้นสุด').fill(f.trainingDate);await expect(page.getByRole('button',{name:'บันทึกการอบรม',exact:true})).toBeEnabled();
  const bad=await api(page,'/api/trainings',payload({endsOn:day(new Date(+new Date(f.trainingDate+'T00:00:00Z')-86400000))}));expect(bad.status()).toBe(422);expect((await bad.json()).error).toBe('วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม');
  const wrongQuarter=await api(page,'/api/trainings',payload({quarter:2}));expect(wrongQuarter.status()).toBe(422);
});
test('ประเภทอื่นบังคับรายละเอียด และแก้ผลตรวจแล้วจะกลับรอตรวจพร้อมประวัติ',async({page})=> {
  await login(page,'tester');expect((await api(page,'/api/trainings',payload({category:'other'}))).status()).toBe(422);
  const id=f.participations[0].id;const response=await api(page,`/api/trainings/${id}/result`,{explanation:'ความรู้ที่นำไปใช้ฉบับใหม่',outcome:'ผลลัพธ์สมมติฉบับใหม่',reportedOn:f.trainingDate,version:1});expect(response.status(),await response.text()).toBe(200);
  const result=await testDb.applicationResult.findUniqueOrThrow({where:{participationId:id}});expect(result.version).toBe(2);expect(result.reviewStatus).toBe('pending');expect(await testDb.review.count({where:{applicationResultId:result.id,resultVersion:1}})).toBe(1);
  await page.goto('/trainings/'+id);await expect(page.getByText('รอตรวจ',{exact:true}).first()).toBeVisible();
});
test('CSRF, การสมัครยกระดับสิทธิ์ และ pending account ไม่สร้างบุคลากรซ้ำ',async({page})=> {
  await page.goto('/register');await expect(page.locator('form[action="/api/auth/register"] button')).toBeEnabled();const count=await testDb.person.count(),csrf=await page.locator('form[action="/api/auth/register"] input[name=csrf]').inputValue();
  const body={name:'พัฒนา สมมติ',departmentId:f.departments[5].id,username:'pending',password:testPassword,passwordConfirmation:testPassword,csrf};
  const escalated=await page.request.post('/api/auth/register',{headers:{Origin:'http://127.0.0.1:3001',Accept:'application/json'},data:{...body,role:'ADMIN'}});expect(escalated.status()).toBe(422);
  const created=await page.request.post('/api/auth/register',{headers:{Origin:'http://127.0.0.1:3001',Accept:'application/json'},data:body});expect(created.status(),await created.text()).toBe(200);const account=await testDb.user.findUniqueOrThrow({where:{username:'pending'}});expect(account.role).toBe('USER');expect(account.personId).toBeNull();expect(account.approvedAt).toBeNull();expect(await testDb.person.count()).toBe(count);
  expect(await testDb.notification.count({where:{idempotencyKey:{startsWith:`registration:${account.id}:`}}})).toBe(2);
  await expect.poll(async()=>(await testDb.notification.findFirst({where:{channel:'email',idempotencyKey:{startsWith:`registration:${account.id}:`}}}))?.status).toBe('failed');
  await login(page);await page.goto('/admin/notices');await expect(page.getByText('สมาชิกใหม่จะแจ้งในระบบ', {exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'ลองส่งรายการค้างใหม่'})).toBeVisible();
  const missing=await page.request.post('/api/trainings',{headers:{Origin:'http://127.0.0.1:3001',Accept:'application/json'},data:payload()});expect(missing.status()).toBe(419);
  const cross=await page.request.post('/api/trainings',{headers:{Origin:'https://attacker.example',Accept:'application/json'},data:payload()});expect(cross.status()).toBe(403);
});
test('XLSX จริงมี Table/กราฟแก้ไขได้และตัวกรองตรงกับ Dashboard ภายใน 10 วินาที',async({page})=> {
  await login(page);const filters={fiscalYearId:f.year.id,personId:f.user.personId,quarter:1,from:day(f.participations[0].createdAt),category:'professional'};
  // ใช้ช่วงวันอบรมจริงของ fixture เพื่อให้รายงานมีหนึ่งรายการ
  const activity=await testDb.trainingActivity.findUniqueOrThrow({where:{id:f.participations[0].trainingActivityId}});const exact={...filters,from:day(activity.startsOn),to:day(activity.startsOn)};
  const report=await (await page.request.get('/api/dashboard?'+new URLSearchParams(Object.fromEntries(Object.entries(exact).map(([k,v])=>[k,String(v)]))))).json();expect(report.rows).toHaveLength(1);
  const started=Date.now(),response=await api(page,'/api/exports',{...exact,kind:'dashboard',format:'xlsx',dataVersion:report.year.dataVersion});expect(response.status(),await response.text()).toBe(200);expect(Date.now()-started).toBeLessThan(10000);
  const {id}=await response.json(),file=await page.request.get('/api/exports/'+id),buffer=await file.body();expect(buffer.subarray(0,2).toString()).toBe('PK');const zip=await JSZip.loadAsync(buffer);expect(zip.file('xl/charts/chart1.xml')).not.toBeNull();expect(zip.file('xl/tables/table1.xml')).not.toBeNull();
  const book=new ExcelJS.Workbook();await book.xlsx.load(buffer as never);expect(book.getWorksheet('รายละเอียดอบรม')!.getCell('K2').value).toBe(report.rows[0].activity.title);expect(book.getWorksheet('ภาพรวม KPI')!.getCell('E3').value).toBe(report.kpis[1].actual);expect(book.getWorksheet('รายละเอียดอบรม')!.views[0]).toMatchObject({state:'frozen',ySplit:1});
});
test('CSV ภาษาไทยพร้อม BOM ปลอดภัยต่อสูตร และรายงานดาวน์โหลดเฉพาะเจ้าของ',async({page})=> {
  await testDb.trainingActivity.update({where:{id:f.participations[0].trainingActivityId},data:{title:'=SUM(1,2), "ตัวอย่าง"\nภาษาไทย'}});await login(page);const report=await (await page.request.get('/api/dashboard')).json();const response=await api(page,'/api/exports',{fiscalYearId:f.year.id,kind:'normal',format:'csv',dataVersion:report.year.dataVersion});expect(response.status(),await response.text()).toBe(200);const {id}=await response.json();const bytes=await (await page.request.get('/api/exports/'+id)).body();expect(bytes.subarray(0,3)).toEqual(Buffer.from([0xEF,0xBB,0xBF]));expect(bytes.toString()).toContain("'=SUM(1,2)");
  await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).click();await login(page,'tester');expect((await page.request.get('/api/exports/'+id)).status()).toBe(404);
});
test('ไฟล์แนบ chunk อยู่ในฐานข้อมูลและบังคับสิทธิ์ดาวน์โหลด',async({page})=> {
  await login(page,'tester');const id=f.participations[0].id;await page.goto('/trainings/'+id);const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHioAAAAASUVORK5CYII=','base64');await page.getByLabel('เลือกหลักฐาน').setInputFiles({name:'หลักฐาน.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'แนบหลักฐาน',exact:true}).click();await expect(page.getByRole('link',{name:'หลักฐาน.png'})).toBeVisible();const file=await testDb.attachment.findFirstOrThrow();expect(Buffer.from(file.data)).toEqual(png);
  await testDb.user.create({data:{username:'outsider',name:'บุคลากรสมมติอีกคน',passwordHash:(await testDb.user.findUniqueOrThrow({where:{id:f.user.id}})).passwordHash,approvedAt:new Date(),personId:f.persons[2].id}});await page.getByRole('button',{name:'ออกจากระบบ',exact:true}).click();await login(page,'outsider');expect((await page.request.get('/api/attachments/'+file.id)).status()).toBe(403);
});
test('retention ปิดเริ่มต้น และยังลบไม่ได้เมื่อ backup/approval ไม่ครบ',async({page})=> {
  await login(page);const before=await testDb.trainingActivity.count();const preview=await (await page.request.get('/api/admin/retention/'+f.year.id)).json();expect(preview.ready).toBe(false);const response=await api(page,`/api/admin/retention/${f.year.id}/execute`,{confirmation:'ลบปี '+f.year.year});expect(response.status()).toBe(422);expect(await testDb.trainingActivity.count()).toBe(before);await page.goto('/admin/retention');await expect(page.locator('select[name=legalHold]')).toHaveValue('1');
});
