<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrmChatList extends Model
{
    protected $fillable = ['owner_id', 'name', 'color'];

    public function items()
    {
        return $this->hasMany(CrmChatListItem::class, 'list_id');
    }
}
