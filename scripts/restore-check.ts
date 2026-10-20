import 'dotenv/config';
import {PrismaClient,Prisma} from '@prisma/client';
import JSZip from 'jszip';
import {spawnSync} from 'node:child_process';
import {prisma,connectionUrl} from '../lib/prisma';
import {BACKUP_MODELS,canonical,delegate,decodeRow,encodeRow,schemaVersion,type BackupManifest} from '../lib/archive';
import {sha256} from '../lib/security';

function targetKey(value:string) {const u=new URL(value);return `${u.hostname}:${u.port||'5432'}${u.pathname}?schema=${u.searchParams.get('schema')??'public'}`;}
async function main() {
  const id=process.argv[2],target=process.env.RESTORE_DIRECT_URL;
  if(!id||!target)throw new Error('ใช้ npm run db:restore-check -- MANIFEST_ID และกำหนด RESTORE_DIRECT_URL เป็น Neon branch/ฐานว่างแยก');
  if(targetKey(target)===targetKey(process.env.DIRECT_URL!))throw new Error('ห้ามกู้คืนลงฐาน/schema เดียวกับฐานหลัก');
  const archive=await prisma.archiveManifest.findUniqueOrThrow({where:{id}});if(!archive.data||sha256(archive.data)!==archive.sha256)throw new Error('Backup checksum mismatch');
  const zip=await JSZip.loadAsync(archive.data),manifest=JSON.parse(await zip.file('manifest.json')!.async('string')) as BackupManifest;
  const raw=await zip.file('database.json')!.async('string');if(sha256(raw)!==manifest.dataSha256||manifest.schemaVersion!==schemaVersion())throw new Error('Backup data/schema mismatch');
  for(const [path,checksum] of Object.entries(manifest.files)) {const file=zip.file(path);if(!file||sha256(await file.async('nodebuffer'))!==checksum)throw new Error('Backup file checksum mismatch');}
  for(const report of Object.values(manifest.reports)){const file=zip.file(report.path);if(!file||sha256(await file.async('nodebuffer'))!==report.sha256)throw new Error('Backup report checksum mismatch');}
  const restore=new PrismaClient({datasources:{db:{url:connectionUrl(target)}}});
  try {
    const schema=new URL(target).searchParams.get('schema')??'public';
    const tables=await restore.$queryRaw<{tablename:string}[]>`SELECT tablename FROM pg_tables WHERE schemaname=${schema}`;
    if(tables.length)throw new Error('ฐาน/schema ทดสอบต้องว่าง ระบบจะไม่ล้างข้อมูลให้');
    const migrated=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{cwd:process.cwd(),env:{...process.env,DATABASE_URL:target,DIRECT_URL:target},encoding:'utf8'});
    if(migrated.status!==0)throw new Error('Restore migration failed (ตรวจ connection และสิทธิ์ฐานแยก)');
    const data=JSON.parse(raw) as Record<string,Record<string,unknown>[]>;
    if(Object.keys(data).sort().join()!==[...BACKUP_MODELS].sort().join())throw new Error('Backup model list mismatch');
    await restore.$transaction(async tx=> {
      // The target was verified empty before migrations. Remove only the bootstrap
      // row created by the historical data migration before restoring its snapshot.
      await tx.strategy.deleteMany({where:{id:'rmutt-strategy-4'}});
      for(const model of BACKUP_MODELS) {
        for(let start=0;start<data[model].length;start+=100) {
          const rows=await Promise.all(data[model].slice(start,start+100).map(row=>decodeRow(model,row,zip)));if(rows.length)await delegate(tx,model).createMany({data:rows});
        }
        const actual=await delegate(tx,model).findMany({orderBy:{id:'asc'}});
        if(actual.length!==manifest.counts[model])throw new Error('Restore row count mismatch');
        const encoded=actual.map(row=>encodeRow(model,row)).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
        const expected=[...data[model]].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
        if(canonical(encoded)!==canonical(expected))throw new Error('Restore row value mismatch: '+model);
      }
      // กู้คืนแล้วต้องรับรอง backup/อนุมัติลบใหม่ ไม่ใช้ใบอนุมัติจากอดีต
      await tx.deletionApproval.deleteMany();await tx.archiveManifest.updateMany({data:{restoreTestedAt:null,receivedAt:null,receivedBy:null,state:'created'}});
    },{timeout:120000});
    await prisma.archiveManifest.update({where:{id},data:{state:'restore_verified',restoreTestedAt:new Date(),restoreEvidence:{dataSha256:manifest.dataSha256,counts:manifest.counts,fileCount:Object.keys(manifest.files).length,restoreTargetHash:sha256(targetKey(target)),verifiedAt:new Date().toISOString()}}});
    await prisma.auditLog.create({data:{action:'restore_test_passed',entity:'archive_manifests',entityId:id,fiscalYearId:archive.fiscalYearId}});
    console.log('กู้คืนลงฐานแยกและตรวจทุกแถว/ทุกไฟล์สำเร็จ ไม่มีการเปลี่ยนข้อมูลธุรกิจฐานหลัก');
  }finally{await restore.$disconnect();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Restore check failed');process.exitCode=1;}).finally(()=>prisma.$disconnect());
