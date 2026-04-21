<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('media_metrics', function (Blueprint $table) {
            $table->id();
            $table->string('node_id');
            $table->integer('cpu_usage');
            $table->integer('bandwidth_mbps');
            $table->integer('active_transports');
            $table->timestamp('recorded_at')->useCurrent();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('media_metrics');
    }
};
