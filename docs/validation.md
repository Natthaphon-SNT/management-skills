# ผลตรวจเตรียม deploy — 20 ตุลาคม 2569

- Unit tests: 7 ผ่าน ครอบคลุมปีงบประมาณ leap day, CSV formula injection, connection URL, retry และ origin ของ local/server
- Playwright: 32 ผ่าน ทั้ง desktop และ mobile รวม Authentication จริง, secure cookie, CSRF, USER ownership, ADMIN, รายงาน XLSX/CSV, native Excel chart, ไฟล์แนบ, ปฏิทิน, responsive 18 ขนาดจอ, ลบฟีเจอร์แผน และบุคลากรใหม่ที่ยังไม่มี snapshot
- Service integration: ผ่านสิทธิ์ดู/แก้/ลบรายงานและแต่งตั้งแอดมิน, การแจ้งเตือนสามวันและหยุดอีเมลเก่า, การค้นหาและส่งออก, การสร้าง snapshot โดยไม่ทับข้อยกเว้น/ปีปิด
- Restore integration: กู้คืนข้อมูลและไฟล์แนบจริงลง PostgreSQL schema ใหม่ ตรวจค่าทุกแถวและ checksum ของไฟล์/รายงานครบ และปฏิเสธ target ที่มีข้อมูลอยู่แล้ว
- `npm run build`: ผ่าน Prisma migrations และ TypeScript
- `npm audit --omit=dev`: ไม่พบช่องโหว่ หลังอัปเดต Nodemailer และ dependency overrides โดยคง Prisma 6
- ตรวจไฟล์ที่เตรียม commit กับ secrets ใน environment local/production: ไม่พบข้อมูลลับที่ตรงกัน ไม่มี `.env` หรือ `.vercel` ติดเข้า commit

Neon Production เป็นฐานใหม่ มีเพียงข้อมูลเริ่มต้นจาก seed ไม่ได้นำข้อมูลทดสอบและบัญชี user ทดสอบขึ้น Production อีเมลจริงยังไม่ทดสอบส่ง เนื่องจากยังไม่มี SMTP ของหน่วยงาน เอกสาร PDF ต้นทางยังไม่ได้รับ
