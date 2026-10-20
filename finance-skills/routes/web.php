<?php

use Illuminate\Support\Facades\{Route, DB, Cache};
use App\Http\Controllers\{AuthController, DashboardController, TrainingController, PlanController, AdminController, ExportController, RetentionController};

Route::get('/',fn()=>redirect(auth()->check()?'/dashboard':'/login'));
Route::get('/health',function() { try { DB::select('SELECT 1'); return response()->json(['status'=>'ok']); } catch(\Throwable $e) { return response()->json(['status'=>'unavailable'],503); } });
Route::middleware('guest')->group(function() {
    Route::get('/login',[AuthController::class,'form'])->name('login');
    Route::post('/login',[AuthController::class,'login'])->middleware('throttle:30,1');
    Route::get('/register',[AuthController::class,'registerForm']);
    Route::post('/register',[AuthController::class,'register'])->middleware('throttle:5,1');
});
Route::post('/logout',[AuthController::class,'logout'])->middleware('auth');
Route::middleware(['auth','approved'])->group(function() {
    Route::get('/dashboard',DashboardController::class)->name('dashboard');
    Route::get('/trainings',[TrainingController::class,'index']);
    Route::get('/trainings/create',[TrainingController::class,'form']);
    Route::post('/trainings',[TrainingController::class,'save']);
    Route::get('/trainings/{id}/edit',[TrainingController::class,'form'])->whereNumber('id');
    Route::get('/trainings/{id}',[TrainingController::class,'show'])->whereNumber('id');
    Route::put('/trainings/{id}',[TrainingController::class,'save'])->whereNumber('id');
    Route::post('/trainings/{id}/result',[TrainingController::class,'result'])->whereNumber('id');
    Route::post('/trainings/{id}/review',[TrainingController::class,'review'])->middleware('admin')->whereNumber('id');
    Route::post('/trainings/{id}/attachments',[TrainingController::class,'upload'])->whereNumber('id');
    Route::get('/attachments/{id}',[TrainingController::class,'download'])->whereNumber('id');
    Route::get('/plans',[PlanController::class,'index']); Route::post('/plans',[PlanController::class,'create']);
    Route::get('/plans/{id}',[PlanController::class,'show'])->whereNumber('id');
    Route::put('/plans/{id}',[PlanController::class,'update'])->whereNumber('id');
    Route::post('/plans/{id}/items',[PlanController::class,'saveItem'])->whereNumber('id');
    Route::put('/plans/{id}/items/{itemId}',[PlanController::class,'saveItem'])->whereNumber(['id','itemId']);
    Route::get('/exports',[ExportController::class,'index']); Route::post('/exports',[ExportController::class,'create']); Route::get('/exports/{id}',[ExportController::class,'download'])->whereNumber('id');
    // Session API ใช้ middleware และ ownership เดียวกับหน้าเว็บ; mutation ใช้ CSRF เช่นเดียวกัน
    Route::get('/api/dashboard',DashboardController::class);
    Route::get('/api/trainings',[TrainingController::class,'index']);
    Route::get('/api/trainings/{id}',[TrainingController::class,'show'])->whereNumber('id');
    Route::post('/api/trainings',[TrainingController::class,'save']);
    Route::put('/api/trainings/{id}',[TrainingController::class,'save'])->whereNumber('id');
    Route::get('/api/plans/{id}',[PlanController::class,'show'])->whereNumber('id');
    Route::prefix('admin')->middleware('admin')->group(function() {
        Route::get('/',[AdminController::class,'index']); Route::post('/years',[AdminController::class,'year']);
        Route::post('/years/{id}/scopes',[AdminController::class,'addScope']); Route::put('/scopes/{id}',[AdminController::class,'scope']);
        Route::post('/personnel',[AdminController::class,'person']); Route::put('/personnel/{id}',[AdminController::class,'person']);
        Route::put('/accounts/{id}',[AdminController::class,'account']);
        Route::post('/departments',[AdminController::class,'department']); Route::put('/departments/{id}',[AdminController::class,'department']);
        Route::post('/strategies',[AdminController::class,'strategy']); Route::put('/strategies/{id}',[AdminController::class,'strategy']);
        Route::post('/kpis',[AdminController::class,'kpi']); Route::get('/audit',[AdminController::class,'audit']);
        Route::get('/retention',[RetentionController::class,'index']); Route::post('/retention/{id}/policy',[RetentionController::class,'policy']);
        Route::post('/retention/{id}/state',[RetentionController::class,'state']); Route::post('/retention/{id}/archive',[RetentionController::class,'create']);
        Route::post('/retention/{id}/execute',[RetentionController::class,'execute']);
        Route::get('/archives/{id}',[RetentionController::class,'download']); Route::post('/archives/{id}/verify',[RetentionController::class,'verify']);
        Route::post('/archives/{id}/receive',[RetentionController::class,'receive']); Route::post('/archives/{id}/approve',[RetentionController::class,'approve']);
        Route::get('/notices',[RetentionController::class,'notices']); Route::get('/notices.csv',[RetentionController::class,'noticesCsv']);
    });
});
