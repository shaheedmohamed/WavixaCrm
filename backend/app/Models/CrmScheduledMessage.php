<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrmScheduledMessage extends Model
{
    protected $table = 'crm_scheduled_messages';

    protected $fillable = [
        'user_id',
        'conversation_id',
        'body',
        'send_at',
        'status',
        'sent_message_id',
        'fail_reason',
    ];

    protected $casts = [
        'send_at' => 'datetime',
    ];

    public function conversation()
    {
        return $this->belongsTo(WhatsAppConversation::class, 'conversation_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
