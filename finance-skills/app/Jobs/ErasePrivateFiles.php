<?php
namespace App\Jobs;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\{DB, Storage};
final class ErasePrivateFiles implements ShouldQueue
{
    use Queueable;
    public int $tries=10;
    public function __construct(public array $paths) {}
    public function backoff(): array { return [60,300,3600]; }
    public function handle(): void {
        foreach($this->paths as $path) {
            if(!preg_match('#^(evidence|exports)/[a-zA-Z0-9._/-]+$#',$path) || str_contains($path,'..')) throw new \RuntimeException('เส้นทางไฟล์ไม่ปลอดภัย');
            if(DB::table('attachments')->where('path',$path)->exists() || DB::table('export_jobs')->where('path',$path)->exists()) continue;
            if(Storage::disk('local')->exists($path) && !Storage::disk('local')->delete($path)) throw new \RuntimeException('ลบไฟล์ไม่สำเร็จ');
        }
    }
}
