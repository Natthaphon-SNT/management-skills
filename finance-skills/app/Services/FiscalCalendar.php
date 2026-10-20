<?php
namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

final class FiscalCalendar
{
    public static function bounds(int $buddhistYear, ?int $quarter = null): array
    {
        $start = CarbonImmutable::create($buddhistYear - 544, 10, 1, 0, 0, 0, 'Asia/Bangkok');
        if ($quarter !== null) {
            if ($quarter < 1 || $quarter > 4) throw new \InvalidArgumentException('ไตรมาสไม่ถูกต้อง');
            $start = $start->addMonths(($quarter - 1) * 3);
        }
        return [$start->toDateString(), $start->addMonths($quarter ? 3 : 12)->subDay()->toDateString()];
    }

    public static function identify(string $date): array
    {
        $d = CarbonImmutable::createFromFormat('!Y-m-d', $date, 'Asia/Bangkok');
        return ['year' => $d->year + 543 + ($d->month >= 10 ? 1 : 0), 'quarter' => intdiv(($d->month + 2) % 12, 3) + 1];
    }

    public static function validate(object $year, int $quarter, string $start, string $end, bool $exception): void
    {
        if ($end < $start) throw ValidationException::withMessages(['ends_on'=>'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม']);
        [$low, $high] = self::bounds($year->year, $quarter);
        if ($start < $low || $start > $high) throw ValidationException::withMessages(['starts_on'=>'วันที่เริ่มไม่ตรงกับปีงบประมาณและไตรมาสที่เลือก']);
        if ($end > $high && !$exception) throw ValidationException::withMessages(['ends_on'=>'กิจกรรมข้ามไตรมาสต้องระบุเหตุผลและให้ ADMIN ตรวจทาน']);
    }
}
