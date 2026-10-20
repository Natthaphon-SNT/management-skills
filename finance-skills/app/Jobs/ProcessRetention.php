<?php
namespace App\Jobs;
use App\Services\{RetentionService, Records};
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
final class ProcessRetention implements ShouldQueue
{
    use Queueable;
    public function handle(RetentionService $retention): void {
        if(!config('skills.retention_enabled')) return;
        foreach(DB::table('retention_policies')->where('auto_delete',true)->get() as $policy) {
            if(DB::table('fiscal_years')->where('id',$policy->fiscal_year_id)->value('state')==='purged') continue;
            $preview=$retention->preview($policy->fiscal_year_id);
            if($preview['ready']) $retention->execute($policy->fiscal_year_id,false);
            else Records::audit('deletion_held','fiscal_years',$policy->fiscal_year_id,year:$policy->fiscal_year_id,changes:['reasons'=>$preview['reasons']]);
        }
        $retention->expireArtifacts(false);
    }
}
