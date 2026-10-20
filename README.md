# ระบบบริหารจัดการและติดตามผลการพัฒนาทักษะของบุคลากรกองคลัง

เว็บภาษาไทยสำหรับกองคลัง มทร.ธัญบุรี ใช้ Next.js App Router, TypeScript และ Prisma 6 กับ PostgreSQL มีทะเบียนบุคลากร บัญชี USER/ADMIN บันทึกการอบรม ผลการนำไปใช้ การตรวจทาน แจ้งเตือน และรายงาน Excel/CSV ตามตัวกรอง

แอปปัจจุบันอยู่ที่ root ของ repository ส่วน `finance-skills/` เก็บ source Laravel รุ่นเดิมเพื่ออ้างอิง ไม่ใช่ deployment target และถูกตัดออกจากไฟล์ deploy ไป Vercel ฟีเจอร์แผนพัฒนารายบุคคลและยุทธศาสตร์ถูกนำออกตามข้อกำหนดล่าสุด ตารางเดิมยังอยู่เพื่อรักษาข้อมูลและการกู้คืนสำรอง

## เปิดบนเครื่อง

ใช้ Node.js 24 และ PostgreSQL ที่เปิดใช้งานอยู่ หรือใช้ connection string ของ Neon สำหรับฐานพัฒนาแยกจาก Production

```powershell
npm ci
Copy-Item .env.example .env
# แก้ .env ให้ครบก่อนทำขั้นตอนถัดไป
npx prisma migrate deploy
npm run db:seed
npm run dev
```

เปิด http://localhost:3000 ใช้ชื่อบัญชี `admin` และรหัสที่ตั้งใน `ADMIN_INITIAL_PASSWORD` การรัน seed ซ้ำไม่เปลี่ยนรหัสบัญชีที่มีอยู่ และไม่สร้างบัญชี user ทดสอบใน Production สมาชิกสมัครได้ที่ `/register` แล้วรอแอดมินเชื่อมทะเบียนและอนุมัติ

หากมีบุคลากรเก่าที่ขาดฐานประเมินในปีที่ยังเปิดอยู่ ให้รัน `npx tsx scripts/sync-personnel-scopes.ts` คำสั่งนี้เพิ่มเฉพาะรายการที่ขาด โดยไม่ทับฝ่ายหรือการยกเว้นที่ผู้ดูแลตั้งไว้

## Deploy ไป Vercel และ Neon

1. สร้าง Neon project แผน Free เลือก Singapore แล้วคัดลอก pooled URL ไป `DATABASE_URL` และ direct URL ไป `DIRECT_URL` หรือสร้าง Neon ผ่าน Vercel Marketplace โดยเลือก Free และ Singapore
2. สร้าง `.env` สำหรับฐานที่จะ deploy ตั้ง `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET` (สุ่มอย่างน้อย 32 ตัวอักษร) และ `ADMIN_INITIAL_PASSWORD` (อย่างน้อย 12 ตัวอักษร) ห้ามใส่รหัสผ่าน production ใน source code
3. รัน `npx prisma migrate deploy` แล้ว `npm run db:seed` กับฐานที่กำหนด ก่อนเปิดให้ใช้งานจริง ห้ามชี้ seed ไปฐานอื่นโดยไม่ตรวจ URL
4. Commit และ push โค้ดขึ้น GitHub โดยไม่รวม `.env`, `.env.production`, `.vercel` หรือไฟล์ฐานข้อมูล
5. ใน Vercel เลือก Add New → Project → Import repository นี้ ตั้ง Framework Preset เป็น Next.js, Root Directory เป็น root, Node.js 24.x และ Build Command เป็น `npm run build`
6. ตั้ง Environment Variables ทั้ง 4 ตัวสำหรับ Production ให้ `DATABASE_URL` มี host แบบ `-pooler` และ `DIRECT_URL` เป็น host ตรง ทั้งคู่ใช้ `sslmode=require&connect_timeout=15` หาก Neon Marketplace ตั้ง URL ให้ ให้เพิ่ม `DIRECT_URL` จาก `DATABASE_URL_UNPOOLED` ที่ได้รับ
7. กด Deploy แล้วเปิด `/api/health` ต้องได้ `{"ok":true}` หากเชื่อมฐานไม่ได้ endpoint ตอบ 503 โดยไม่ส่งรายละเอียดข้อผิดพลาดของฐานข้อมูล
8. เข้า `/login` ด้วย `admin` และรหัสเริ่มต้น แล้วเปลี่ยนรหัสผ่านทันที ตรวจข้อมูลทะเบียนแอดมินให้เป็นข้อมูลจริงก่อนใช้งาน
9. Neon Free อาจพัก compute เมื่อไม่ใช้งาน การเข้าใช้งานครั้งแรกจึงอาจช้าราว 1 วินาทีหรือมากกว่านั้นตามการปลุกเครื่องและเครือข่าย Vercel Hobby มีเงื่อนไขการใช้งานส่วนบุคคลและไม่ใช่เชิงพาณิชย์ หน่วยงานควรตรวจว่าแผนที่เลือกเหมาะกับรูปแบบใช้งานจริง

Build จะรัน migration ก่อน `next build` และ postinstall สร้าง Prisma Client อัตโนมัติ ทุก route ที่ใช้ฐานข้อมูล/Excel ทำงานบน Node.js โดยกำหนด `maxDuration=10` ตามข้อกำหนดของโปรเจกต์ ไม่ใช่การอ้างว่า Vercel ทุกแผนมีเวลาสูงสุดเท่านี้

## แจ้งเตือน

สมาชิกใหม่จะสร้างรายการแจ้งแอดมินในระบบและคิวอีเมลทันทีที่สมัคร ลองส่งหลังตอบกลับฟอร์ม หากยังไม่ตั้ง SMTP จะแสดงส่งไม่สำเร็จและเก็บไว้ลองใหม่ ดู [วิธีตั้งค่าอีเมลทีละขั้น](docs/email-setup.md) สำหรับ Gmail App Password และ SMTP หน่วยงาน

กำหนดส่งผลการนำไปใช้คำนวณจากวันสิ้นสุดการอบรม + 3 วันปฏิทิน แจ้งแอดมินก่อนกำหนด 1 วัน ในวันกำหนด และหลังเกินกำหนดจนกรอกผลแล้ว รายงานล่าช้ายังส่งได้ ไม่เตือนรายการยกเลิกหรือสร้างข้อความซ้ำวันเดียวกัน

รายการเตือนกำหนดรายงานอบรมสร้างเมื่อแอดมินเปิดระบบหรือ Cron ทำงาน ส่วนงานอัตโนมัติใช้ Cron ใน `vercel.json` ทุกวันเวลา 19:00 UTC (ประมาณ 02:00 น. วันถัดไปในไทย ทั้งนี้รอบเรียกจริงขึ้นกับผู้ให้บริการ) ต้องตั้ง `CRON_SECRET` เป็นค่าสุ่มอย่างน้อย 32 ตัวอักษร อีเมลต้องตั้ง `SMTP_URL`, `MAIL_FROM` และอีเมลของบัญชีแอดมินด้วย ไม่มีการจำลองสถานะส่งสำเร็จหากไม่มี SMTP

อ่านรายละเอียดที่ [กติกาการรายงาน](docs/reporting-rules.md)

## สำรองและกู้คืน

แอดมินสร้าง ZIP แบบ private ในฐานข้อมูลได้ มี checksum และข้อมูลประกอบ การอนุมัติลบต้องตรงกับรุ่นข้อมูลล่าสุดและผ่านการกู้คืนจริงก่อน ตั้ง `RESTORE_DIRECT_URL` เป็น Neon branch หรือฐาน/schema ว่างแยกจากฐานหลัก แล้วรัน:

```powershell
npm run db:restore-check -- MANIFEST_ID
```

คำสั่งไม่ล้างฐานเป้าหมายให้ และจะปฏิเสธฐานเดียวกับฐานหลัก งานกู้คืนเป็นคำสั่งบนเครื่องของผู้ดูแล เนื่องจากเกินเวลาของ API 10 วินาทีได้ สำเนา ZIP รุ่นเก่าและ secrets ต้องเก็บในคลังสำรองแยกด้วย การลบอัตโนมัติปิดเป็นค่าเริ่มต้น มี legal hold และเงื่อนไขอนุมัติหลายขั้น

## ทดสอบ

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
```

E2E ต้องตั้ง `TEST_DATABASE_URL` แยกจาก `DATABASE_URL` โดยใช้ schema ชื่อลงท้าย `_test` จะล้างเฉพาะ schema ทดสอบและไม่ใช้ข้อมูล Production ส่วนชุดตรวจบริการเพิ่มเติมรันด้วย `npx tsx tests/admin-permissions.integration.ts`, `npx tsx tests/report-workflow.integration.ts` และ `npx tsx tests/personnel-visibility.integration.ts` ทีละคำสั่ง

ตัวกรองมีปีงบประมาณ ไตรมาส ฝ่าย และค้นหาชื่อ ข้อมูลบนจอและส่งออกใช้การค้นหาเดียวกัน ผู้ใช้ทั่วไปเข้าถึงเฉพาะข้อมูลตนเอง แอดมินจัดการได้ทุกคน รายงานจำกัด 5,000 แถวต่อไฟล์เพื่อให้เหมาะกับเวลา serverless ไฟล์แนบเก็บเป็น private bytes ในฐานข้อมูล รองรับสูงสุด 10 MB ผ่านการอัปโหลดเป็นส่วนย่อย

ยังไม่ได้รับ PDF ต้นทางเพื่อยืนยันชื่อเกณฑ์ทางการและเลขหน้า ค่าเป้าหมาย KPI ไม่ได้สมมติแทนหน่วยงาน ต้องกำหนดจากเกณฑ์ที่ได้รับรอง

เอกสารผู้ให้บริการ: [Vercel CLI](https://vercel.com/docs/cli), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Neon connection latency](https://neon.com/docs/connect/connection-latency)
