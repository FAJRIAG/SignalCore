<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\RoomController;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    
    Route::post('/rooms', [RoomController::class, 'create']);
    Route::post('/rooms/{uuid}/join', [RoomController::class, 'join']);
    Route::post('/rooms/{uuid}/leave', [RoomController::class, 'leave']);
});
