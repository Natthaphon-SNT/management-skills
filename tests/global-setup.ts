import {spawnSync} from 'node:child_process';
import {testUrl,testDb} from './fixtures';
export default async function setup() {
  const migrated=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:testUrl,DIRECT_URL:testUrl},encoding:'utf8'});
  if(migrated.status!==0)throw new Error('สร้างฐานทดสอบไม่สำเร็จ ตรวจ TEST_DATABASE_URL (ไม่แสดง connection string)');
  await testDb.$disconnect();
}
