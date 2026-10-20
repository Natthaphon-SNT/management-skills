import 'dotenv/config';
import {prisma,sqlTable} from '../lib/prisma';
import {snapshot,audit,touchYear} from '../lib/records';
async function main(){
  let added=0;
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM ${sqlTable('fiscal_years')} ORDER BY id FOR UPDATE`;
    const years=await tx.fiscalYear.findMany({where:{state:'open'},select:{id:true}});
    for(const year of years){
      const before=await tx.annualPersonnelScope.count({where:{fiscalYearId:year.id}});
      await snapshot(tx,year.id);
      const count=await tx.annualPersonnelScope.count({where:{fiscalYearId:year.id}})-before;
      if(count){added+=count;await touchYear(tx,year.id);await audit(tx,null,'repair_missing_personnel_scopes','fiscal_years',year.id,undefined,year.id,{added:count});}
    }
  },{timeout:15000});
  console.log(`Added ${added} missing annual personnel entries. Existing snapshots and exclusions preserved.`);
}
main().catch(()=>{console.error('Personnel scope sync failed; connection details omitted');process.exitCode=1;}).finally(()=>prisma.$disconnect());
