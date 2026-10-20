import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {fixture,testDb} from '../fixtures';
import {randomToken,sha256,sign} from '../../lib/security';

// Opt in only. Fixtures refuses production/public schemas before any mutation.
test.skip(process.env.UPDATE_GUIDE_IMAGES!=='1','Run explicitly to refresh synthetic guide screenshots');
test.afterAll(()=>testDb.$disconnect());
test('capture guide images from synthetic data only',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop');
  const f=await fixture();
  await testDb.user.create({data:{username:'member-demo',name:'สมาชิกใหม่ สมมติ',passwordHash:f.user.passwordHash,registrationDepartmentId:f.departments[5].id}});
  await mkdir('public/manual',{recursive:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/login');await page.evaluate(()=>localStorage.setItem('finance-theme','light'));await page.reload();
  await page.screenshot({path:'public/manual/login.jpg',type:'jpeg',quality:85});
  const adminToken=randomToken(),userToken=randomToken();
  for(const [userId,token] of [[f.admin.id,adminToken],[f.user.id,userToken]])await testDb.authSession.create({data:{userId,tokenHash:sha256(sign(token)),csrfToken:randomToken(),expiresAt:new Date(Date.now()+600000)}});
  const shots=[['dashboard','/dashboard','.main-content'],['training','/trainings/create','.main-content'],['result','/trainings/'+f.participations[1].id,'.main-content > section.card:nth-of-type(2)'],['export','/dashboard','#export'],['personnel','/admin','#personnel'],['accounts','/admin','#accounts'],['scopes','/admin','#scopes'],['review','/trainings/'+f.participations[0].id,'.main-content > section.card:nth-of-type(4)'],['notices','/admin/notices','.main-content'],['retention','/admin/retention','.main-content']] as const;
  for(const [name,path,selector] of shots){
    const token=['dashboard','training','result','export'].includes(name)?userToken:adminToken;
    await page.context().addCookies([{name:'management_session',value:token,url:'http://127.0.0.1:3001',httpOnly:true,sameSite:'Lax'}]);
    await page.goto(path);await expect(page.getByRole('heading',{name:'โหลดข้อมูลไม่สำเร็จ'})).toHaveCount(0);
    if(name==='accounts')await page.locator('#accounts > details').first().locator(':scope > summary').click();
    if(name==='personnel')await page.locator('#personnel > details').first().locator(':scope > summary').click();
    const target=page.locator(selector);await expect(target).toBeVisible();
    await target.screenshot({path:`public/manual/${name}.jpg`,type:'jpeg',quality:85});
  }
});
