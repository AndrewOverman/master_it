<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PlanController;
use App\Http\Controllers\Api\PlanStepController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::post('register', [AuthController::class, 'register']);
    Route::post('login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('logout', [AuthController::class, 'logout']);

        Route::get('user', [UserController::class, 'show']);
        Route::patch('user', [UserController::class, 'update']);

        Route::get('plans', [PlanController::class, 'index']);
        Route::post('plans', [PlanController::class, 'store']);
        Route::get('plans/featured', [PlanController::class, 'featured']);
        Route::post('plans/{plan}/copy', [PlanController::class, 'copy']);
        Route::get('plans/{plan}', [PlanController::class, 'show']);
        Route::patch('plans/{plan}', [PlanController::class, 'update']);
        Route::patch('plans/{plan}/steps/{step}', [PlanStepController::class, 'update']);
    });
});
