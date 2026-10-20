<?php
return [
    'required'=>'กรุณากรอก :attribute','required_if'=>'กรุณากรอก :attribute เมื่อเลือก :value','confirmed'=>'การยืนยัน :attribute ไม่ตรงกัน',
    'unique'=>':attribute นี้มีอยู่แล้ว','exists'=>'ไม่พบ :attribute ที่เลือก','date_format'=>'กรุณาเลือก :attribute เป็นวันที่ที่ถูกต้อง',
    'after_or_equal'=>':attribute ต้องไม่ก่อน :date','before_or_equal'=>':attribute ต้องไม่หลัง :date','in'=>':attribute ไม่อยู่ในตัวเลือกที่อนุญาต',
    'prohibited'=>'ไม่อนุญาตให้ส่งค่า :attribute','integer'=>':attribute ต้องเป็นจำนวนเต็ม','numeric'=>':attribute ต้องเป็นตัวเลข','boolean'=>':attribute ต้องเป็น 0 หรือ 1',
    'string'=>':attribute ต้องเป็นข้อความ','email'=>'รูปแบบอีเมลไม่ถูกต้อง','alpha_dash'=>'ชื่อผู้ใช้ใช้ได้เฉพาะอักษรอังกฤษ ตัวเลข ขีดกลางและขีดล่าง',
    'min'=>['string'=>':attribute ต้องมีอย่างน้อย :min ตัวอักษร','numeric'=>':attribute ต้องไม่น้อยกว่า :min','array'=>':attribute ต้องมีอย่างน้อย :min รายการ'],
    'max'=>['string'=>':attribute ยาวได้ไม่เกิน :max ตัวอักษร','numeric'=>':attribute ต้องไม่เกิน :max','file'=>'ไฟล์ต้องไม่เกิน :max KB','array'=>'จำนวนรายการต้องไม่เกิน :max'],
    'between'=>['numeric'=>':attribute ต้องอยู่ระหว่าง :min ถึง :max'],'mimes'=>'รองรับไฟล์ PDF, JPG และ PNG เท่านั้น','file'=>'กรุณาเลือกไฟล์','regex'=>'รูปแบบ :attribute ไม่ถูกต้อง','accepted'=>'กรุณายืนยัน :attribute',
    'custom'=>['ends_on'=>['after_or_equal'=>'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม']],
    'attributes'=>['username'=>'ชื่อผู้ใช้','password'=>'รหัสผ่าน','name'=>'ชื่อ-นามสกุล','department_id'=>'ฝ่าย','person_id'=>'บุคลากร','starts_on'=>'วันที่เริ่ม','ends_on'=>'วันที่สิ้นสุด','title'=>'ชื่อหัวข้อ','fiscal_year_id'=>'ปีงบประมาณ','quarter'=>'ไตรมาส','report_due_on'=>'กำหนดรายงานผล','comment'=>'ความเห็น','confirmation'=>'การยืนยัน','from'=>'วันที่เริ่มช่วง','to'=>'วันที่สิ้นสุดช่วง','schedules'=>'กำหนดการ'],
];
