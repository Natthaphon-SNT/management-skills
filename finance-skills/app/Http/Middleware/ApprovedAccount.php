<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

final class ApprovedAccount
{
    public function handle(Request $request, Closure $next)
    {
        abort_unless($request->user()?->active && $request->user()?->approved_at && $request->user()?->person_id, 403, 'บัญชียังไม่ผ่านอนุมัติหรือถูกระงับ');
        $response = $next($request);
        $response->headers->set('Cache-Control', 'private, no-store');
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'same-origin');
        $response->headers->set('X-Frame-Options', 'DENY');
        return $response;
    }
}
