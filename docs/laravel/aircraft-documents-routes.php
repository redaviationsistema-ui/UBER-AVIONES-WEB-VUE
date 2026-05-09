<?php

use App\Http\Controllers\ProviderAircraftDocumentController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/provider/aircraft/{id}/documents', [ProviderAircraftDocumentController::class, 'store']);
    Route::post('/proveedor/aeronaves/{id}/documentos', [ProviderAircraftDocumentController::class, 'store']);
    Route::post('/operator/aircraft/{id}/documents', [ProviderAircraftDocumentController::class, 'store']);
});
