<?php
// นำเข้าผ่าน AppServiceProvider เพื่อให้ใช้ฐานแยกโดยไม่มีค่าเริ่มต้นเป็นฐานหลัก
return [
    'driver'=>'pgsql','host'=>env('RESTORE_DB_HOST',env('DB_HOST','127.0.0.1')),'port'=>env('RESTORE_DB_PORT',env('DB_PORT','5432')),
    'database'=>env('RESTORE_DB_DATABASE'),'username'=>env('RESTORE_DB_USERNAME',env('DB_USERNAME')),'password'=>env('RESTORE_DB_PASSWORD',env('DB_PASSWORD')),
    'charset'=>'utf8','prefix'=>'','search_path'=>'public','sslmode'=>env('RESTORE_DB_SSLMODE','prefer'),
];
