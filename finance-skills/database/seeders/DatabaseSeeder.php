<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $now=now();
        foreach(['ผู้อำนวยการ','บริหารงานทั่วไป','พัสดุ','ตรวจสอบและเบิกจ่าย 1','ตรวจสอบและเบิกจ่าย 2','บัญชี','การเงิน'] as $name) {
            \Illuminate\Support\Facades\DB::table('departments')->insertOrIgnore(['name'=>$name,'active'=>true,'created_at'=>$now,'updated_at'=>$now]);
        }
        $current=\App\Services\FiscalCalendar::identify(today()->toDateString())['year'];
        foreach(array_unique([2569,$current]) as $year) {
            [$start,$end]=\App\Services\FiscalCalendar::bounds($year);
            \Illuminate\Support\Facades\DB::table('fiscal_years')->insertOrIgnore(['year'=>$year,'starts_on'=>$start,'ends_on'=>$end,'created_at'=>$now,'updated_at'=>$now]);
        }
        foreach(\Illuminate\Support\Facades\DB::table('fiscal_years')->get() as $year) \Illuminate\Support\Facades\DB::table('retention_policies')->insertOrIgnore(['fiscal_year_id'=>$year->id,'notice_days'=>json_encode([30,7,1]),'auto_delete'=>false,'legal_hold'=>true,'created_at'=>$now,'updated_at'=>$now]);
        if(config('skills.demo_accounts')) $this->call(DemoSeeder::class);
    }
}
