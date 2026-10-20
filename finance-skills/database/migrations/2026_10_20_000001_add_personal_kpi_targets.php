<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void { Schema::table('kpi_definitions',fn(Blueprint $t)=>$t->foreignId('person_id')->nullable()->constrained('personnel')->restrictOnDelete()); }
    public function down(): void { Schema::table('kpi_definitions',fn(Blueprint $t)=>$t->dropConstrainedForeignId('person_id')); }
};
