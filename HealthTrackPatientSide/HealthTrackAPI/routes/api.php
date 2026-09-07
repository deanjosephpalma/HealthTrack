<?php

use App\Http\Controllers\Api\AiController;
use App\Http\Controllers\Api\AccountAdminController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\HeatMapController;
use App\Http\Controllers\Api\NotifyController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\PatientRegisterController;
use App\Http\Controllers\Api\VerificationController;
use App\Http\Middleware\EnsurePortalSession;
use Illuminate\Support\Facades\Route;

Route::middleware(['throttle:api'])->group(function () {
    // Cookie session auth (Sanctum SPA)
    Route::post('/auth/login', [AuthController::class, 'login'])
        ->middleware('throttle:login');
    Route::post('/auth/bridge-session', [AuthController::class, 'bridgeSession'])
        ->middleware('throttle:login');
    Route::post('/auth/patient-register', [PatientRegisterController::class, 'register'])
        ->middleware('throttle:login');
    Route::get('/geo/patient-address', [PatientRegisterController::class, 'addressOptions']);

    Route::post('/auth/password-reset/request', [PasswordResetController::class, 'request'])
        ->middleware('throttle:password-reset');
    Route::post('/auth/password-reset/confirm', [PasswordResetController::class, 'confirm'])
        ->middleware('throttle:password-reset');

    Route::middleware([EnsurePortalSession::class])->group(function () {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/refresh', [AuthController::class, 'refresh']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);
    });

    Route::middleware([EnsurePortalSession::class.':patient'])->group(function () {
        Route::post('/verification/send', [VerificationController::class, 'send'])
            ->middleware('throttle:verification-send');
        Route::post('/verification/verify', [VerificationController::class, 'verify'])
            ->middleware('throttle:verification-verify');
    });

    Route::middleware([EnsurePortalSession::class.':staff'])->group(function () {
        Route::get('/heatmap/pila-diseases', [HeatMapController::class, 'pilaDiseases'])
            ->middleware('throttle:heatmap');

        Route::post('/ai/generate', [AiController::class, 'generate'])
            ->middleware('throttle:ai');

        Route::post('/notify/email', [NotifyController::class, 'email'])
            ->middleware('throttle:notify');
        Route::post('/notify/sms', [NotifyController::class, 'sms'])
            ->middleware('throttle:notify');
        Route::get('/accounts', [AccountAdminController::class, 'index'])
            ->middleware('throttle:api');
        Route::post('/accounts/reset-password', [AccountAdminController::class, 'resetPassword'])
            ->middleware('throttle:password-reset');
    });
});
