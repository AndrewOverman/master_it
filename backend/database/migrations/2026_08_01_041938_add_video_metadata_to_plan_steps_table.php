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
        Schema::table('plan_steps', function (Blueprint $table) {
            $table->string('video_title')->nullable()->after('video_url');
            $table->string('video_channel')->nullable()->after('video_title');
            $table->unsignedBigInteger('video_view_count')->nullable()->after('video_channel');
            $table->timestamp('video_published_at')->nullable()->after('video_view_count');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('plan_steps', function (Blueprint $table) {
            $table->dropColumn(['video_title', 'video_channel', 'video_view_count', 'video_published_at']);
        });
    }
};
