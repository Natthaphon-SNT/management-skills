<?php
namespace App\Http\Middleware;
use Closure;
use Illuminate\Http\Request;
final class AdminOnly
{
    public function handle(Request $request, Closure $next) { \App\Services\Records::admin($request->user()); return $next($request); }
}
