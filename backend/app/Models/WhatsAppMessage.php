<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsAppMessage extends Model
{
    protected $table = 'whatsapp_messages';

    protected $fillable = [
        'user_id',
        'api_key_id',
        'session_id',
        'conversation_id',
        'campaign_id',
        'campaign_recipient_id',
        'from',
        'to',
        'sender_name',
        'message',
        'media_url',
        'media_meta',
        'media_caption',
        'media_mime_type',
        'media_size',
        'reactions',
        'mentioned_jids',
        'starred_at',
        'starred_by_user_id',
        'sent_by_user_id',
        'reply_to_id',
        'is_forwarded',
        'latitude',
        'longitude',
        'sender_country',
        'message_id',
        'job_id',
        'message_type',
        'direction',
        'status',
        'attempts',
        'error_message',
        'timestamp',
        'queued_at',
        'processed_at',
        'completed_at',
        'failed_at',
        'scheduled_at',
        'sent_at',
        'delivered_at',
        'read_at',
        'revoked_at',
        'edited_at',
        'is_view_once',
        'payload',
        'internal_note',
        'internal_note_by',
    ];

    protected $casts = [
        'timestamp' => 'datetime',
        'queued_at' => 'datetime',
        'scheduled_at' => 'datetime',
        'processed_at' => 'datetime',
        'completed_at' => 'datetime',
        'failed_at' => 'datetime',
        'sent_at' => 'datetime',
        'delivered_at' => 'datetime',
        'read_at' => 'datetime',
        'revoked_at' => 'datetime',
        'reactions' => 'array',
        'mentioned_jids' => 'array',
        'starred_at' => 'datetime',
        'media_meta' => 'array',
        'payload' => 'array',
        'edited_at' => 'datetime',
        'is_view_once' => 'boolean',
        'is_forwarded' => 'boolean',
        'latitude' => 'float',
        'longitude' => 'float',
    ];

    public const STATUS_PENDING = 'pending';
    public const STATUS_QUEUED = 'queued';
    public const STATUS_PROCESSING = 'processing';
    public const STATUS_SENT = 'sent';
    public const STATUS_FAILED = 'failed';
    public const STATUS_RETRYING = 'retrying';
    public const STATUS_DELIVERED = 'delivered';
    public const STATUS_READ = 'read';
    public const STATUS_SCHEDULED = 'scheduled';

    public function apiKey(): BelongsTo
    {
        return $this->belongsTo(ApiKey::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(WhatsAppSession::class, 'session_id');
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(WhatsAppConversation::class, 'conversation_id');
    }

    public function starredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'starred_by_user_id');
    }

    /** The CRM user who sent this outgoing message (null = sent from WhatsApp). */
    public function sentBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by_user_id');
    }
}
