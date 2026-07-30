<?php

namespace App\Providers;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Client types (src/types/plan.ts) expect bare Plan / Plan[] shapes,
        // not Laravel's default {"data": ...} envelope.
        JsonResource::withoutWrapping();
    }
}
