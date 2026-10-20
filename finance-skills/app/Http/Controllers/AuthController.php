<?php
namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Records;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Auth, DB, RateLimiter};
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rules\Password;

final class AuthController extends Controller
{
    public function form() { return view('auth.login'); }
    public function registerForm() { return view('auth.register', ['departments'=>DB::table('departments')->where('active',true)->get()]); }

    public function login(Request $request)
    {
        $data = $request->validate(['username'=>'required|string|max:100','password'=>'required|string|max:255']);
        $key = 'login:'.hash('sha256', mb_strtolower($data['username']).'|'.$request->ip());
        if (RateLimiter::tooManyAttempts($key, 5)) throw ValidationException::withMessages(['username'=>'เข้าสู่ระบบไม่สำเร็จหลายครั้ง กรุณารอ '.RateLimiter::availableIn($key).' วินาที']);
        if (!Auth::attempt([...$data, 'active'=>true])) {
            RateLimiter::hit($key,60); throw ValidationException::withMessages(['username'=>'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง']);
        }
        if (!Auth::user()->approved_at || !Auth::user()->person_id) {
            Auth::logout(); RateLimiter::hit($key,60);
            throw ValidationException::withMessages(['username'=>'บัญชีอยู่ระหว่างรอ ADMIN ตรวจสอบและเชื่อมทะเบียนบุคลากร']);
        }
        RateLimiter::clear($key); $request->session()->regenerate(); Records::audit('login','users',Auth::id());
        return redirect()->intended('/dashboard');
    }

    public function register(Request $request)
    {
        $data = $request->validate(['name'=>'required|string|max:255', 'department_id'=>'required|exists:departments,id',
            'username'=>'required|alpha_dash:ascii|min:3|max:100|unique:users,username',
            'password'=>['required','confirmed',Password::min(12)], 'role'=>'prohibited','person_id'=>'prohibited','approved_at'=>'prohibited']);
        abort_unless(DB::table('departments')->where('id',$data['department_id'])->value('active'),422);
        DB::transaction(function () use ($data) {
            $user = new User; $user->name=$data['name']; $user->username=$data['username']; $user->password=$data['password'];
            $user->role='USER'; $user->registration_department_id=$data['department_id'];
            // รอการเชื่อมทะเบียนจากผู้ดูแล ไม่สร้างบุคลากรซ้ำจากชื่อที่กรอกเอง
            if (!config('skills.registration_approval') && !DB::table('personnel')->where('full_name',$data['name'])->exists()) {
                $id=DB::table('personnel')->insertGetId(['code'=>'REG-'.\Illuminate\Support\Str::uuid(),'full_name'=>$data['name'],'hired_on'=>today()->toDateString(),'active'=>true,'created_at'=>now(),'updated_at'=>now()]);
                DB::table('personnel_assignments')->insert(['person_id'=>$id,'department_id'=>$data['department_id'],'starts_on'=>today()->toDateString(),'created_at'=>now(),'updated_at'=>now()]);
                $user->person_id=$id; $user->approved_at=now();
            }
            $user->save(); Records::audit('register','users',$user->id,actor:$user->id);
        });
        return redirect('/login')->with('success','สมัครสมาชิกแล้ว หากบัญชียังไม่ผ่านอนุมัติ กรุณาติดต่อ ADMIN เพื่อเชื่อมทะเบียนบุคลากร');
    }

    public function logout(Request $request)
    {
        Auth::logout(); $request->session()->invalidate(); $request->session()->regenerateToken(); return redirect('/login');
    }
}
