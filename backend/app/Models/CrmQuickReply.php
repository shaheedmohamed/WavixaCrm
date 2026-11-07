<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrmQuickReply extends Model
{
    protected $fillable = ['owner_id', 'shortcut', 'body', 'sort_order'];
}
