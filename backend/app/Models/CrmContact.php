<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrmContact extends Model
{
    protected $table = 'crm_contacts';

    protected $fillable = ['owner_id', 'name', 'phone', 'phone_tail'];
}
