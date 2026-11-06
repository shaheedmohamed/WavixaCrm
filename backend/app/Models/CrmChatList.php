<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrmChatList extends Model
{
    protected $fillable = ['owner_id', 'name'];

    public function items()
    {
        return $this->hasMany(CrmChatListItem::class, 'list_id');
    }
}
