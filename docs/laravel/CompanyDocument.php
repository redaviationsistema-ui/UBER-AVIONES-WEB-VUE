<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class CompanyDocument extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'provider_id',
        'document_name',
        'file_name',
        'file_path',
        'mime_type',
        'file_size_bytes',
        'status',
        'expires_at',
        'uploaded_by_user_id',
        'notes',
    ];

    protected $casts = [
        'expires_at' => 'date',
    ];

    public function provider()
    {
        return $this->belongsTo(Provider::class);
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by_user_id');
    }
}
