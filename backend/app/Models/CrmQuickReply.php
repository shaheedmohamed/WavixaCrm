<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrmQuickReply extends Model
{
    protected $fillable = ['owner_id', 'shortcut', 'body', 'sort_order', 'is_shared'];

    protected $casts = ['is_shared' => 'boolean'];

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_id');
    }
}
