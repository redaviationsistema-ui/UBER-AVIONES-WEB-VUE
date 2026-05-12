<?php

use App\Http\Controllers\ProviderAircraftDocumentController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/provider/aircraft/{id}/documents', [ProviderAircraftDocumentController::class, 'store']);
    Route::post('/proveedor/aeronaves/{id}/documentos', [ProviderAircraftDocumentController::class, 'store']);
    Route::post('/operator/aircraft/{id}/documents', [ProviderAircraftDocumentController::class, 'store']);
    Route::get('/provider/aircraft/{id}/documents/{documentId}/download', [ProviderAircraftDocumentController::class, 'download']);
    Route::get('/proveedor/aeronaves/{id}/documentos/{documentId}/descargar', [ProviderAircraftDocumentController::class, 'download']);
    Route::get('/operator/aircraft/{id}/documents/{documentId}/download', [ProviderAircraftDocumentController::class, 'download']);
    Route::get('/admin/aircraft-documents/{documentId}/download', [ProviderAircraftDocumentController::class, 'downloadAdmin']);
});
