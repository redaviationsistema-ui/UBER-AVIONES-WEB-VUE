<?php

use App\Http\Controllers\ProviderCompanyDocumentController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/provider/company/documents', [ProviderCompanyDocumentController::class, 'store']);
    Route::post('/proveedor/empresa/documentos', [ProviderCompanyDocumentController::class, 'store']);
});
