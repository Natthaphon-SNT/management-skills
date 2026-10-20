type Year={startsOn:Date,endsOn:Date};
type Person={id:string,code:string,fullName:string,hiredOn:Date,leftOn:Date|null,assignments:{departmentId:string,startsOn:Date,endsOn:Date|null}[]};
type Scope={personId:string,included:boolean};

export function scopeReadiness(year:Year,people:Person[],scopes:Scope[]){
  const existing=new Set(scopes.map(s=>s.personId));
  const ready:{id:string,code:string,fullName:string,departmentId:string}[]=[],missingDepartment:{id:string,code:string,fullName:string}[]=[];
  let outsidePeriod=0;
  for(const person of people){
    if(person.hiredOn>year.endsOn||(person.leftOn&&person.leftOn<year.startsOn)){outsidePeriod++;continue;}
    if(existing.has(person.id))continue;
    const first=person.assignments.filter(a=>a.startsOn<=year.endsOn&&(!a.endsOn||a.endsOn>=year.startsOn)).sort((a,b)=>+a.startsOn-+b.startsOn)[0];
    const identity={id:person.id,code:person.code,fullName:person.fullName};
    if(first)ready.push({...identity,departmentId:first.departmentId});else missingDepartment.push(identity);
  }
  return {ready,missingDepartment,existing:scopes.length,excluded:scopes.filter(s=>!s.included).length,outsidePeriod};
}
