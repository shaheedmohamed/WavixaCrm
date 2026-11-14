<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Plan Limit Enforcement
    |--------------------------------------------------------------------------
    |
    | Master switch for plan/subscription limit checks (device count, agent
    | count, monthly message quota). Set BILLING_ENFORCE_LIMITS=false to give
    | every user unlimited access while the plans system stays in place but
    | inactive. Flip back to true to re-enable enforcement.
    |
    */
    'enforce_limits' => env('BILLING_ENFORCE_LIMITS', true),
];
