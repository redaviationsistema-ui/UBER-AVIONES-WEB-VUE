<?php

namespace App\Http\Controllers;

use App\Models\Aircraft;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProviderAircraftController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $providerId = auth()->user()?->provider_id ?? $request->input('provider_id');

        $data = $this->validatedAircraftData($request);
        $data['provider_id'] = $providerId;
        $data['status'] = $data['status'] ?? 'trial_active';

        $aircraft = Aircraft::create($data);

        return response()->json([
            'success' => true,
            'aircraft' => $aircraft->fresh(),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $aircraft = Aircraft::query()
            ->when(
                auth()->user()?->provider_id,
                fn ($query, $providerId) => $query->where('provider_id', $providerId)
            )
            ->findOrFail($id);

        $data = $this->validatedAircraftData($request);

        $aircraft->fill($data);
        $aircraft->save();

        return response()->json([
            'success' => true,
            'aircraft' => $aircraft->fresh(),
        ]);
    }

    private function validatedAircraftData(Request $request): array
    {
        $data = $request->validate([
            'model' => ['required', 'string', 'max:255'],
            'manufacturer' => ['nullable', 'string', 'max:255'],
            'registration' => ['required', 'string', 'max:255'],
            'year' => ['nullable', 'integer'],
            'model_year' => ['nullable', 'integer'],
            'capacity' => ['nullable', 'integer'],
            'range_km' => ['nullable', 'integer'],
            'amenities' => ['nullable'],
            'base_airport' => ['nullable', 'string', 'max:255'],
            'coverage' => ['nullable', 'string'],
            'hourly_rate' => ['nullable', 'numeric'],
            'minimum_hours' => ['nullable', 'integer'],
            'operational_cost' => ['nullable', 'numeric'],
            'status' => ['nullable', 'string', 'max:100'],
        ]);

        $data['amenities'] = $this->normalizeAmenities($request->input('amenities'));
        $data['manufacturer'] = $this->nullableString($data['manufacturer'] ?? null);
        $data['coverage'] = $this->nullableString($data['coverage'] ?? null);
        $data['base_airport'] = $this->nullableString($data['base_airport'] ?? null);
        $data['registration'] = trim((string) ($data['registration'] ?? ''));
        $data['model'] = trim((string) ($data['model'] ?? ''));
        $data['model_year'] = $data['model_year'] ?? $data['year'] ?? null;

        unset($data['year']);

        return $data;
    }

    private function normalizeAmenities(mixed $value): array
    {
        if (is_array($value)) {
            return array_values(array_filter(array_map(
                fn ($item) => trim((string) $item),
                $value
            )));
        }

        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === '') {
                return [];
            }

            return array_values(array_filter(array_map('trim', explode(',', $trimmed))));
        }

        return [];
    }

    private function nullableString(mixed $value): ?string
    {
        $trimmed = trim((string) ($value ?? ''));
        return $trimmed === '' ? null : $trimmed;
    }
}
