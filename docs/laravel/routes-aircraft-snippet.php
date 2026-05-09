<?php

use App\Http\Controllers\ProviderAircraftController;
use App\Http\Controllers\ProviderAircraftDocumentController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/provider/aircraft', [ProviderAircraftController::class, 'store']);
    Route::put('/provider/aircraft/{id}', [ProviderAircraftController::class, 'update']);
    Route::post('/provider/aircraft/{id}/documents', [ProviderAircraftDocumentController::class, 'store']);

    Route::post('/proveedor/aeronaves', [ProviderAircraftController::class, 'store']);
    Route::put('/proveedor/aeronaves/{id}', [ProviderAircraftController::class, 'update']);
    Route::post('/proveedor/aeronaves/{id}/documentos', [ProviderAircraftDocumentController::class, 'store']);

    Route::post('/operator/aircraft/{id}/documents', [ProviderAircraftDocumentController::class, 'store']);
});
