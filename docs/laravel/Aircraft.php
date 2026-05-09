<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Aircraft extends Model
{
    protected $table = 'aircraft';

    protected $fillable = [
        'provider_id',
        'model',
        'manufacturer',
        'registration',
        'model_year',
        'capacity',
        'range_km',
        'amenities',
        'base_airport',
        'coverage',
        'hourly_rate',
        'minimum_hours',
        'operational_cost',
        'status',
        'trial_starts_at',
        'trial_ends_at',
        'approved_at',
    ];

    protected $casts = [
        'amenities' => 'array',
        'model_year' => 'integer',
        'capacity' => 'integer',
        'range_km' => 'integer',
        'hourly_rate' => 'decimal:2',
        'minimum_hours' => 'integer',
        'operational_cost' => 'decimal:2',
        'trial_starts_at' => 'datetime',
        'trial_ends_at' => 'datetime',
        'approved_at' => 'datetime',
    ];

    public function documents()
    {
        return $this->hasMany(AircraftDocument::class);
    }
}
