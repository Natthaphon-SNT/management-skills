<?php
namespace App\Http\Controllers;
use App\Services\ReportService;
use Illuminate\Http\Request;
final class DashboardController extends Controller
{
    public function __invoke(Request $request,ReportService $reports) {
        $report=$reports->build($request->user(),$request->query());
        return $request->is('api/*') || $request->expectsJson() ? response()->json($report) : view('dashboard',$report);
    }
}
