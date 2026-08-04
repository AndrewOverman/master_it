<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PlanController;
use App\Http\Controllers\Api\PlanStepController;
use App\Http\Controllers\Api\SharedPlanController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::post('register', [AuthController::class, 'register'])->middleware('throttle:register');
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('logout', [AuthController::class, 'logout']);

        Route::get('user', [UserController::class, 'show']);
        Route::patch('user', [UserController::class, 'update']);
        Route::get('user/export', [UserController::class, 'export']);
        Route::delete('user', [UserController::class, 'destroy']);

        Route::get('plans', [PlanController::class, 'index']);
        Route::post('plans', [PlanController::class, 'store']);
        Route::get('plans/featured', [PlanController::class, 'featured']);
        Route::get('plans/shared/{token}', [SharedPlanController::class, 'show']);
        Route::post('plans/shared/{token}/copy', [SharedPlanController::class, 'copy']);
        Route::post('plans/{plan}/copy', [PlanController::class, 'copy']);
        Route::get('plans/{plan}/related', [PlanController::class, 'related']);
        Route::get('plans/{plan}', [PlanController::class, 'show']);
        Route::patch('plans/{plan}', [PlanController::class, 'update']);
        Route::post('plans/{plan}/reset', [PlanController::class, 'reset']);
        Route::post('plans/{plan}/share', [PlanController::class, 'share']);
        Route::delete('plans/{plan}/share', [PlanController::class, 'unshare']);
        Route::get('plans/{plan}/steps/{step}', [PlanStepController::class, 'show']);
        Route::patch('plans/{plan}/steps/{step}', [PlanStepController::class, 'update']);
    });
});
