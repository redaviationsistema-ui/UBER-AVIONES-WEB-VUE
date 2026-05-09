<?php

namespace App\Http\Controllers;

use App\Models\CompanyDocument;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ProviderCompanyDocumentController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:pdf', 'max:10240'],
            'document_name' => ['nullable', 'string', 'max:255'],
            'expires_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        $user = Auth::user();
        $providerId = $user->provider_id;

        abort_unless($providerId, 422, 'El usuario autenticado no tiene provider_id.');

        $file = $validated['file'];
        $storedPath = $file->store("providers/{$providerId}/company-documents", 'public');

        $document = CompanyDocument::create([
            'provider_id' => $providerId,
            'document_name' => $validated['document_name'] ?: $file->getClientOriginalName(),
            'file_name' => $file->getClientOriginalName(),
            'file_path' => $storedPath,
            'mime_type' => $file->getClientMimeType(),
            'file_size_bytes' => $file->getSize(),
            'status' => 'pending',
            'expires_at' => $validated['expires_at'] ?? null,
            'uploaded_by_user_id' => $user->id,
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'document' => $document,
        ], 201);
    }
}
