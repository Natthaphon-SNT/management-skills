<?php
namespace App\Services;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\{Spreadsheet, Cell\DataType, Cell\Coordinate, Writer\Xlsx};
use PhpOffice\PhpSpreadsheet\Worksheet\{Worksheet, Table};
use PhpOffice\PhpSpreadsheet\Chart\{Chart, DataSeries, DataSeriesValues, Legend, PlotArea, Title};

final class ExportService
{
    public static function safeCell(mixed $value): mixed
    {
        if (!is_string($value)) return $value;
        return preg_match('/^[\s\x{FEFF}\x{200B}]*[=+@\-]/u',$value) || preg_match('/^[\t\r\n]/',$value) ? "'".$value : $value;
    }

    public function create(array $report,string $kind,string $format): array
    {
        $path='exports/'.Str::uuid().'.'.$format; Storage::disk('local')->makeDirectory('exports');
        $headers=['รหัสบุคลากร','ชื่อ-นามสกุล','ฝ่าย ณ วันอบรม','ปีงบประมาณ','ไตรมาส','วันที่เริ่ม','วันที่สิ้นสุด','หน่วยงานที่จัด','ประเภท','หลักสูตร/หัวข้อ','สถานที่','ชั่วโมง','สถานะอบรม','สถานะผล','คำอธิบายการนำไปใช้','ผลลัพธ์จริง','วันที่รายงาน','ยุทธศาสตร์','เป้าหมาย IDP','หลักฐาน (ไฟล์)'];
        $rows=$report['rows']->map(fn($r)=>[$r->code,$r->full_name,$r->department_name,$report['year']->year,$r->quarter,$r->starts_on,$r->ends_on,$r->organizer,
            config('skills.categories.'.$r->category).($r->other_category?' / '.$r->other_category:''),$r->title,$r->location,$r->hours===null?null:(float)$r->hours,
            config('skills.states.'.$r->status),$r->review_status?config('skills.states.'.$r->review_status):'รอกรอกผลการนำไปใช้',$r->explanation,$r->outcome,$r->reported_on,$r->strategy_name,$r->plan_item_id??'นอกแผน',(int)$r->evidence_count])->all();
        if($kind==='idp') {
            $headers=['รหัสเป้าหมาย','ชื่อ-นามสกุล','ประเภทบุคลากร','ตำแหน่ง','ชื่อแผน','หมวดแผน','หัวข้อ','ระดับศึกษา','ตำแหน่งที่ขอ','ปีงบประมาณที่กำหนด','ไตรมาส','ยุทธศาสตร์สถาบัน','ยุทธศาสตร์หน่วยงาน','ข้อความการนำไปใช้ในแผน (ยังไม่ใช่ผลจริง)','หมายเหตุ','ต้องตรวจทานเอกสาร'];
            $rows=$report['items']->map(function($i) use($report) { $person=$report['scopes']->firstWhere('person_id',$i->person_id); return [$i->id,$person?->full_name,$person?->personnel_type,$person?->position,$i->plan_title,config('skills.plan_categories.'.$i->category),$i->topic,$i->degree,$i->higher_position,$report['year']->year,$i->quarter,$report['lookups']['strategies']->firstWhere('id',$i->institution_strategy_id)?->name,$report['lookups']['strategies']->firstWhere('id',$i->department_strategy_id)?->name,$i->planned_application,$i->notes,$i->needs_source_review?'ใช่':'ไม่']; })->all();
        }
        if($format==='csv') {
            $handle=fopen(Storage::disk('local')->path($path),'wb'); fwrite($handle,"\xEF\xBB\xBF");
            fputcsv($handle,$headers,',','"','');
            foreach($rows as $row) fputcsv($handle,array_map([self::class,'safeCell'],$row),',','"',''); fclose($handle);
        } else {
            $book=new Spreadsheet(); $sheet=$book->getActiveSheet(); $sheet->setTitle($kind==='idp'?'แผน IDP':'รายละเอียดอบรม');
            $this->table($sheet,$headers,$rows,'ReportData');
            if($kind==='idp') $sheet->getPageSetup()->setFitToWidth(0); // คงขนาดตัวอักษร ให้ตารางต่อหน้าตามแนวนอน
            $meta=$book->createSheet()->setTitle('เงื่อนไขรายงาน');
            $this->table($meta,['รายการ','ค่า'],[
                ['ปีงบประมาณ',$report['year']->year],['ช่วงวันที่',$report['periodStart'].' ถึง '.$report['periodEnd']],
                ['ตัวกรอง',json_encode($report['filters'],JSON_UNESCAPED_UNICODE)],['สร้างเมื่อ (Bangkok)',now()->toIso8601String()],
                ['รุ่นข้อมูล',$report['year']->data_version],['ขอบเขต',$report['scopeNote']],['ที่มาข้อมูล IDP','ข้อความในแผนไม่ใช่ผลการอบรมจริง; PDF ต้นทางยังไม่ได้รับเพื่อยืนยัน mapping'],
            ],'ReportMetadata');
            if($kind==='dashboard') {
                $overview=$book->createSheet()->setTitle('ภาพรวม KPI');
                $kpiRows=array_map(fn($k)=>[$k['code'],$k['name'],$k['numerator'],$k['denominator'],$k['actual'],$k['target'],$k['gap'],$k['attainment'],$k['unit'],$k['status'],$k['formula'],$k['definition_id'],$k['version']],$report['kpis']);
                $this->table($overview,['รหัส','KPI','ตัวตั้ง','ตัวหาร','ผลจริง','เป้าหมาย','ส่วนต่างผลจริง-เป้าหมายตามทิศทาง','ผลจริงเทียบเป้าหมาย (%)','หน่วย','สถานะ','สูตร','นิยาม ID','รุ่นนิยาม'],$kpiRows,'KpiSummary');
                $this->chart($overview);
                $hours=$book->createSheet()->setTitle('ฐานบุคลากรและชั่วโมง');
                $this->table($hours,['รหัสบุคลากร','ชื่อ-นามสกุล','ฝ่ายในฐานประเมิน','ชั่วโมงตามเกณฑ์ F','รายการไม่มีข้อมูลชั่วโมง','เป้าหมายรายบุคคล','ช่องว่างตามทิศทาง'],$report['personHours']->map(fn($p)=>array_values($p))->all(),'PersonnelHours');
                $book->setActiveSheetIndex($book->getIndex($overview));
            }
            $writer=new Xlsx($book); $writer->setIncludeCharts(true); $writer->save(Storage::disk('local')->path($path)); $book->disconnectWorksheets();
        }
        return ['path'=>$path,'sha256'=>hash_file('sha256',Storage::disk('local')->path($path)),'row_count'=>count($rows)];
    }

    private function table(Worksheet $sheet,array $headers,array $rows,string $tableName): void
    {
        $sheet->fromArray($headers,null,'A1');
        foreach($rows as $ri=>$row) foreach(array_values($row) as $ci=>$value) {
            if($value===null) continue;
            $sheet->setCellValueExplicit([$ci+1,$ri+2],$value,is_int($value)||is_float($value)?DataType::TYPE_NUMERIC:DataType::TYPE_STRING);
        }
        $last=Coordinate::stringFromColumnIndex(count($headers)); $end=max(2,count($rows)+1);
        $sheet->addTable(new Table('A1:'.$last.$end,$tableName)); $sheet->freezePane('A2');
        $sheet->getStyle('A1:'.$last.$end)->getFont()->setName('Noto Sans Thai')->setSize(11);
        $sheet->getStyle('A1:'.$last.'1')->getFont()->setBold(true)->getColor()->setARGB('FFFFFFFF');
        $sheet->getStyle('A1:'.$last.'1')->getFill()->setFillType('solid')->getStartColor()->setARGB('FF173F83');
        $sheet->getStyle('A1:'.$last.$end)->getAlignment()->setWrapText(true)->setVertical('top');
        foreach($headers as $ci=>$header) {
            $max=mb_strlen($header); foreach($rows as $row) $max=max($max,min(42,mb_strlen((string)($row[$ci]??''))));
            $sheet->getColumnDimensionByColumn($ci+1)->setWidth(max(14,min(42,$max+3)));
        }
        $sheet->getRowDimension(1)->setRowHeight(36);
        foreach($rows as $ri=>$row) { $lines=1; foreach(array_values($row) as $ci=>$value) $lines=max($lines,(int)ceil(mb_strlen((string)$value)/max(10,$sheet->getColumnDimensionByColumn($ci+1)->getWidth()-4))+substr_count((string)$value,"\n")); $sheet->getRowDimension($ri+2)->setRowHeight(min(240,max(32,$lines*18))); }
        $sheet->getPageSetup()->setOrientation('landscape')->setFitToWidth(1)->setFitToHeight(0);
        $sheet->getPageMargins()->setTop(.3)->setBottom(.3); $sheet->getPageSetup()->setRowsToRepeatAtTopByStartAndEnd(1,1);
    }

    private function chart(Worksheet $sheet): void
    {
        $labels=[new DataSeriesValues('String',"'ภาพรวม KPI'!\$E\$1",null,1),new DataSeriesValues('String',"'ภาพรวม KPI'!\$F\$1",null,1)];
        $categories=[new DataSeriesValues('String',"'ภาพรวม KPI'!\$A\$2:\$A\$6",null,5)];
        $values=[new DataSeriesValues('Number',"'ภาพรวม KPI'!\$E\$2:\$E\$6",null,5),new DataSeriesValues('Number',"'ภาพรวม KPI'!\$F\$2:\$F\$6",null,5)];
        $series=new DataSeries(DataSeries::TYPE_BARCHART,DataSeries::GROUPING_CLUSTERED,[0,1],$labels,$categories,$values); $series->setPlotDirection(DataSeries::DIRECTION_COL);
        $chart=new Chart('KpiChart',new Title('KPI A–E: ผลจริงและเป้าหมาย (%)'),new Legend(),new PlotArea(null,[$series]));
        $chart->setTopLeftPosition('A11')->setBottomRightPosition('J28'); $sheet->addChart($chart);
    }
}
