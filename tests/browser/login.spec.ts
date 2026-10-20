import {test,expect} from '@playwright/test';
import {fixture,testDb,testPassword} from '../fixtures';
test.beforeEach(async()=>{await fixture();});
test.afterAll(()=>testDb.$disconnect());

test('responsive: คอม แท็บเล็ต มือถือ และแนวนอน ไม่มีข้อความหรือฟอร์มล้น',async({page},info)=>{
  const sizes=info.project.name==='desktop'?[[2560,1350],[1920,1080],[1920,900],[1920,860],[1600,900],[1536,864],[1536,960],[1440,900],[1366,768],[1280,720],[1024,768],[820,1180],[768,1024]]:[[430,932],[390,844],[360,640],[320,568],[844,390]];
  await page.goto('/login');
  for(const [width,height] of sizes){
    await page.setViewportSize({width,height});
    await expect(page.locator('.login-visual')).toBeVisible({visible:width>900});
    const layout=await page.evaluate(()=>{
      const title=document.querySelector<HTMLElement>('#system-title')!;
      const elements=[...document.querySelectorAll<HTMLElement>('.login-card,.login-panel,.login-form,input:not([type=hidden]),.login-submit,#system-title')];
      return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,titleFits:title.scrollWidth<=title.clientWidth+1,allFit:elements.every(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;})};
    });
    expect(layout.documentWidth,`${width}x${height}`).toBeLessThanOrEqual(width);
    expect(layout.titleFits,`${width}x${height} title`).toBe(true);
    expect(layout.allFit,`${width}x${height} form`).toBe(true);
    if(width>=1024&&height>=720)expect(layout.height,`${width}x${height} laptop height`).toBeLessThanOrEqual(height+1);
    await page.locator('.login-submit').scrollIntoViewIfNeeded();await expect(page.locator('.login-submit')).toBeInViewport();
    await page.locator('.login-footer').scrollIntoViewIfNeeded();await expect(page.locator('.login-footer')).toBeInViewport();
    if((width===1920&&height===900)||width===1366||width===390)await page.screenshot({path:`../.tools/login-responsive-${width}x${height}.png`,fullPage:true});
  }
});

test('หน้า login responsive, ภาพจริง, แสดงรหัสผ่าน, ธีมจดจำ และสมัครสมาชิก',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/login');
  await expect(page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true})).toBeEnabled();
  await expect(page.locator('header,nav,aside')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.dataset.theme??'light')).toBe('light');
  await expect(page.locator('.login-visual')).toBeVisible({visible:info.project.name==='desktop'});
  for(const selector of ['.login-emblem','.login-visual>img'])expect(await page.locator(selector).evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`../.tools/login-${info.project.name}-light.png`,fullPage:true});
  const password=page.getByLabel('Password',{exact:true});
  await password.fill('visibility-test');await page.getByRole('button',{name:'แสดงรหัสผ่าน',exact:true}).click();
  await expect(password).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'ซ่อนรหัสผ่าน',exact:true}).click();await expect(password).toHaveAttribute('type','password');await password.fill('');
  await page.getByRole('button',{name:'เปลี่ยนเป็นโหมดมืด'}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.reload();
  await expect(page.getByRole('button',{name:'เปลี่ยนเป็นโหมดสว่าง'})).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:`../.tools/login-${info.project.name}-dark.png`,fullPage:true});
  await page.getByRole('button',{name:'เปลี่ยนเป็นโหมดสว่าง'}).click();
  await page.getByLabel('Username',{exact:true}).focus();await page.keyboard.press('Tab');await expect(password).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'แสดงรหัสผ่าน',exact:true})).toBeFocused();
  await page.setViewportSize({width:info.project.name==='mobile'?360:1024,height:480});
  await page.getByRole('link',{name:'สมัครสมาชิก',exact:true}).scrollIntoViewIfNeeded();
  await page.getByRole('link',{name:'สมัครสมาชิก',exact:true}).click();await expect(page).toHaveURL(/\/register$/);
  expect(errors).toEqual([]);
});

test('Authentication จริง: error ภาษาไทย เก็บ Username, loading กันซ้ำ และ Enter เข้าระบบ',async({page})=>{
  await page.goto('/login');const username=page.getByLabel('Username',{exact:true}),password=page.getByLabel('Password',{exact:true});
  await expect(page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true})).toBeEnabled();
  await username.fill('admin');await password.fill('wrong-password-for-test');
  let requests=0;
  await page.route('**/api/auth/login',async route=>{requests++;await new Promise(resolve=>setTimeout(resolve,600));await route.continue();});
  await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
  await expect(page.getByRole('button',{name:'กำลังเข้าสู่ระบบ…'})).toBeDisabled();
  await password.press('Enter');
  await expect(page.locator('.login-error')).toContainText(/[ก-๙]/);
  await expect(username).toHaveValue('admin');await expect(password).toHaveValue('');
  expect(requests).toBe(1);await expect(page).toHaveURL(/\/login$/);
  await password.fill(testPassword);await password.press('Enter');
  await expect(page).toHaveURL(/\/dashboard$/);
  const response=await page.request.get('/api/dashboard');expect(response.status()).toBe(200);
  const cookie=(await page.context().cookies()).find(c=>c.name==='management_session');expect(cookie?.httpOnly).toBe(true);expect(cookie?.secure).toBe(true);
  expect(requests).toBe(2);
});
