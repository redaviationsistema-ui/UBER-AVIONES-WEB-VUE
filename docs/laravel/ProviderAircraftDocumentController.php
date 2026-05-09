<?php

namespace App\Http\Controllers;

use App\Models\Aircraft;
use App\Models\AircraftDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class ProviderAircraftDocumentController extends Controller
{
    public function store(Request $request, int $aircraftId): JsonResponse
    {
        $validated = $request->validate([
            'file' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:25600'],
            'document' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:25600'],
            'documents.*' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:25600'],
            'documents' => ['nullable', 'array'],
            'type' => ['nullable', 'string', 'max:120'],
            'document_type' => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:120'],
            'document_name' => ['nullable', 'string', 'max:255'],
            'expires_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        $user = Auth::user();
        $providerId = $user?->provider_id;

        abort_unless($providerId, 422, 'El usuario autenticado no tiene provider_id.');

        $aircraft = Aircraft::query()
            ->where('provider_id', $providerId)
            ->findOrFail($aircraftId);

        $files = $this->extractFiles($request);
        abort_if(empty($files), 422, 'Debes adjuntar al menos un archivo.');

        $documentType = $validated['document_type']
            ?? $validated['type']
            ?? $validated['category']
            ?? 'documento';

        $documents = [];

        foreach ($files as $file) {
            $storedPath = $file->store(
                "providers/{$providerId}/aircraft-documents/{$aircraft->id}",
                'public'
            );

            $document = AircraftDocument::create([
                'provider_id' => $providerId,
                'aircraft_id' => $aircraft->id,
                'document_type' => $documentType,
                'document_name' => $validated['document_name'] ?: $file->getClientOriginalName(),
                'file_name' => $file->getClientOriginalName(),
                'file_path' => $storedPath,
                'mime_type' => $file->getClientMimeType(),
                'file_size_bytes' => $file->getSize(),
                'status' => 'pending',
                'expires_at' => $validated['expires_at'] ?? null,
                'uploaded_by_user_id' => $user?->id,
                'notes' => $validated['notes'] ?? null,
            ]);

            $documents[] = [
                ...$document->toArray(),
                'file_url' => Storage::disk('public')->url($storedPath),
            ];
        }

        return response()->json([
            'success' => true,
            'uploaded' => count($documents),
            'documents' => $documents,
            'aircraft' => $aircraft->fresh(),
        ], 201);
    }

    private function extractFiles(Request $request): array
    {
        $files = [];

        foreach (['file', 'document'] as $field) {
            $file = $request->file($field);
            if ($file) {
                $files[] = $file;
            }
        }

        foreach ((array) $request->file('documents', []) as $file) {
            if ($file) {
                $files[] = $file;
            }
        }

        return $files;
    }
}
