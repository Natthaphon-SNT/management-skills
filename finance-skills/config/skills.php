<?php

return [
    'registration_approval' => env('REGISTRATION_REQUIRES_APPROVAL', true),
    'demo_accounts' => env('DEMO_ACCOUNTS', false),
    'report_due_days' => (int) env('REPORT_DUE_DAYS', 30), // ค่าเริ่มต้นระบบ ปรับได้ ไม่ใช่เกณฑ์ราชการ
    'retention_enabled' => env('RETENTION_ENABLED', false),
    'categories' => ['professional' => 'ด้านวิชาชีพ', 'teaching' => 'ด้านครู', 'other' => 'อื่น ๆ'],
    'plan_categories' => ['study' => 'ศึกษาต่อ', 'promotion' => 'ขอตำแหน่งสูงขึ้น', 'training' => 'อบรมตามวิชาชีพ'],
    'states' => ['draft'=>'ฉบับร่าง','submitted'=>'ส่งแผนแล้ว','approved'=>'อนุมัติแผนแล้ว','planned'=>'วางแผนเข้าร่วม','completed'=>'อบรมสำเร็จ','cancelled'=>'ยกเลิก','pending'=>'รอตรวจ','verified'=>'ผ่านการตรวจยืนยัน','changes_requested'=>'ขอให้แก้ไข'],
];
