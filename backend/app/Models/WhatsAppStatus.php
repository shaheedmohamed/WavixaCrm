<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsAppStatus extends Model
{
    protected $table = 'whatsapp_statuses';

    protected $fillable = [
        'user_id',
        'session_id',
        'poster_jid',
        'poster_phone',
        'poster_name',
        'poster_avatar',
        'is_mine',
        'message_id',
        'type',
        'body',
        'media_url',
        'media_mime_type',
        'media_size',
        'media_meta',
        'posted_at',
        'expires_at',
        'deleted_at',
        'viewed_at',
    ];

    protected $casts = [
        'is_mine' => 'boolean',
        'media_meta' => 'array',
        'posted_at' => 'datetime',
        'expires_at' => 'datetime',
        'deleted_at' => 'datetime',
        'viewed_at' => 'datetime',
    ];
}
