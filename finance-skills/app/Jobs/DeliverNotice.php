<?php
namespace App\Jobs;

use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\{DB, Mail};

final class DeliverNotice implements ShouldQueue
{
    use Queueable;
    public int $tries=5;
    public function __construct(public int $noticeId) {}
    public function backoff(): array { return [60,300,1800,3600]; }
    public function handle(): void
    {
        $error=null;
        DB::transaction(function () use (&$error) {
            $notice=DB::table('notifications')->where('id',$this->noticeId)->lockForUpdate()->first(); if(!$notice || $notice->status==='sent') return;
            $admin=User::find($notice->user_id);
            try {
                if(!$admin?->active || !$admin?->approved_at || $admin?->role!=='ADMIN') throw new \RuntimeException('ผู้รับไม่ได้เป็น ADMIN ที่ใช้งานอยู่');
                if($notice->channel==='email') {
                    if(!$admin->email) throw new \RuntimeException('ยังไม่ได้ตั้งค่าอีเมล ADMIN');
                    Mail::raw($notice->message,function($message) use($admin,$notice) {
                        $message->to($admin->email)->subject('แจ้งเตือนข้อมูลรายปี กองคลัง');
                        $message->getSymfonyMessage()->getHeaders()->addIdHeader('Message-ID',hash('sha256',$notice->idempotency_key).'@finance-skills.local');
                    });
                }
                DB::table('notifications')->where('id',$notice->id)->update(['status'=>'sent','attempts'=>$notice->attempts+1,'sent_at'=>now(),'error'=>null,'updated_at'=>now()]);
            } catch(\Throwable $e) {
                $error=$e; DB::table('notifications')->where('id',$notice->id)->update(['status'=>'failed','attempts'=>$notice->attempts+1,'error'=>$e instanceof \RuntimeException?$e->getMessage():'ส่งอีเมลไม่สำเร็จ กรุณาตรวจ SMTP','updated_at'=>now()]);
            }
        });
        if($error) throw $error;
    }
}
