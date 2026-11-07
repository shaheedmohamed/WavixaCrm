<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WhatsAppConversation extends Model
{
    protected $table = 'whatsapp_conversations';

    protected $fillable = [
        'user_id',
        'session_id',
        'contact_jid',
        'contact_phone',
        'contact_name',
        'contact_username',
        'contact_avatar',
        'pinned_message_id',
        'pin_expires_at',
        'archived_at',
        'ai_disabled_until',
        'last_message_at',
        'unread_count',
        'last_message',
        'last_message_type',
        'last_message_direction',
        'last_message_status',
        'is_pinned',
        'assigned_agent_id',
        'assigned_at',
        'last_outgoing_user_id',
        'resolved_at',
        'resolved_by',
        'rating',
        'rating_note',
        'transferred_by',
        'transferred_at',
        'transfer_count',
        'group_past_participants',
        'handle_seconds',
    ];

    protected $casts = [
        'ai_disabled_until' => 'datetime',
        'last_message_at' => 'datetime',
        'unread_count' => 'integer',
        'is_pinned' => 'boolean',
        'pin_expires_at' => 'datetime',
        'archived_at' => 'datetime',
        'assigned_agent_id' => 'integer',
        'assigned_at' => 'datetime',
        'resolved_at' => 'datetime',
        'resolved_by' => 'integer',
        'rating' => 'integer',
        'transferred_by' => 'integer',
        'transferred_at' => 'datetime',
        'transfer_count' => 'integer',
        'group_past_participants' => 'array',
        'handle_seconds' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(WhatsAppSession::class, 'session_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(WhatsAppMessage::class, 'conversation_id');
    }

    public function assignedAgent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_agent_id');
    }

    public function resolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }

    public function lastOutgoingUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'last_outgoing_user_id');
    }

    public function transferredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'transferred_by');
    }

    public function logs(): HasMany
    {
        return $this->hasMany(WhatsAppAutoReplyLog::class, 'conversation_id');
    }
}
