<?php
namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class Records
{
    public static function own(User $user, int $personId): void
    {
        abort_unless($user->role === 'ADMIN' || $user->person_id === $personId, 403, 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้');
    }

    public static function admin(User $user): void { abort_unless($user->role === 'ADMIN', 403); }

    public static function year(int $yearId): object
    {
        $year = DB::table('fiscal_years')->where('id', $yearId)->lockForUpdate()->first();
        abort_unless($year, 404);
        if ($year->state !== 'open') throw ValidationException::withMessages(['fiscal_year_id'=>'ปีนี้ปิดรับการแก้ไขแล้ว กรุณาให้ ADMIN เปิดปีก่อน']);
        return $year;
    }

    public static function touch(int $yearId): void { DB::table('fiscal_years')->where('id', $yearId)->increment('data_version'); }

    public static function audit(string $action, string $entity, ?int $id, ?int $owner = null, ?int $year = null, array $changes = [], ?int $actor = null): void
    {
        DB::table('audit_logs')->insert(['actor_id'=>$actor ?? auth()->id(), 'owner_id'=>$owner, 'fiscal_year_id'=>$year,
            'action'=>$action, 'entity'=>$entity, 'entity_id'=>$id, 'changes'=>json_encode($changes, JSON_UNESCAPED_UNICODE), 'created_at'=>now()]);
    }

    public static function assignment(int $personId, string $date): object
    {
        $row = DB::table('personnel_assignments')->where('person_id', $personId)->where('starts_on','<=',$date)
            ->where(fn($q)=>$q->whereNull('ends_on')->orWhere('ends_on','>=',$date))->first();
        if (!$row) throw ValidationException::withMessages(['person_id'=>'ไม่พบประวัติฝ่ายในวันที่เริ่มกิจกรรม กรุณาแก้ทะเบียนบุคลากร']);
        return $row;
    }

    public static function participation(int $id, User $user): object
    {
        $row = DB::table('training_participations as p')->join('training_activities as a','a.id','=','p.training_activity_id')
            ->where('p.id',$id)->select('p.*','a.fiscal_year_id','a.title','a.starts_on','a.ends_on')->first();
        abort_unless($row,404); self::own($user,(int)$row->person_id); return $row;
    }
}
