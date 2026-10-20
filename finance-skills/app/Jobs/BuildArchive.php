<?php
namespace App\Jobs;
use App\Models\User;
use App\Services\ArchiveService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
final class BuildArchive implements ShouldQueue
{
    use Queueable;
    public int $tries=1; public int $timeout=600;
    public function __construct(public int $yearId,public int $actorId) {}
    public function handle(ArchiveService $archives): void {
        $actor=User::findOrFail($this->actorId); abort_unless($actor->active && $actor->approved_at && $actor->role==='ADMIN',403); $archives->create($this->yearId,$actor);
    }
}
