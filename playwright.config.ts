import 'dotenv/config';
import {defineConfig,devices} from '@playwright/test';
const url=process.env.TEST_DATABASE_URL;
if(!url)throw new Error('ต้องกำหนด TEST_DATABASE_URL เป็นฐาน/schema แยกที่ลงท้าย _test');
export default defineConfig({
  testDir:'./tests/browser',globalSetup:'./tests/global-setup.ts',workers:1,fullyParallel:false,timeout:30000,
  reporter:[['list'],['json',{outputFile:'test-results/e2e.json'}]],
  use:{baseURL:'http://127.0.0.1:3001',trace:'off',screenshot:'only-on-failure'},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},{name:'mobile',use:{...devices['Pixel 5']}}],
  webServer:{command:'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001',url:'http://127.0.0.1:3001/api/health',timeout:30000,reuseExistingServer:false,env:{DATABASE_URL:url,DIRECT_URL:url,SMTP_URL:'',MAIL_FROM:'',APP_URL:'http://127.0.0.1:3001',SESSION_SECRET:process.env.SESSION_SECRET!,ADMIN_INITIAL_PASSWORD:process.env.ADMIN_INITIAL_PASSWORD!,CRON_SECRET:'e2e-local-cron-token-for-isolated-tests-only',DATABASE_STORAGE_LIMIT_MB:'1000',AUTO_ANNUAL_REPORTS_ENABLED:'true'}},
});
