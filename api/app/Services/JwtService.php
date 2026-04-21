<?php

namespace App\Services;

use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Storage;

class JwtService
{
    /**
     * Generate an RS256 JWT token for Mediasoup connection authorization
     *
     * @param int $userId
     * @param string $roomId
     * @return string
     */
    public static function generateMediaToken(int $userId, string $roomId): string
    {
        $privateKey = file_get_contents(storage_path('jwt-private.key'));

        $payload = [
            'iss' => config('app.url'),
            'aud' => 'mediasoup-worker',
            'iat' => time(),
            'exp' => time() + config('session.lifetime') * 60,
            'userId' => $userId,
            'roomId' => $roomId,
        ];

        return JWT::encode($payload, $privateKey, 'RS256');
    }
}
