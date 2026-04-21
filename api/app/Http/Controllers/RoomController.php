<?php

namespace App\Http\Controllers;

use App\Models\Room;
use App\Models\RoomParticipant;
use App\Services\JwtService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Redis;

class RoomController extends Controller
{
    public function create(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $room = Room::create([
            'uuid' => (string) Str::uuid(),
            'name' => $request->name,
            'host_id' => $request->user()->id,
            'is_locked' => false,
        ]);

        return response()->json($room, 201);
    }

    public function join(Request $request, $uuid)
    {
        $room = Room::where('uuid', $uuid)->firstOrFail();

        if ($room->is_locked && $room->host_id !== $request->user()->id) {
            return response()->json(['message' => 'Room is locked.'], 403);
        }

        // Logic to find lowest loaded Node.js Worker/SFU via Redis
        // Currently we'll query keys `signalcore:node:*:load` and pick the minimum CPU
        // If none is found, we fallback to a default node 'node-1'
        $lowestLoadNode = $this->getLeastLoadedNode() ?? 'node-1';

        $participant = RoomParticipant::updateOrCreate(
            ['room_id' => $room->id, 'user_id' => $request->user()->id],
            ['node_id' => $lowestLoadNode, 'joined_at' => now(), 'left_at' => null]
        );

        // Notify over Redis PubSub to tell the chosen node to ensure a Router exists for this room
        Redis::publish('signalcore:events', json_encode([
            'type' => 'USER_JOINING',
            'room_id' => $room->uuid,
            'user_id' => $request->user()->id,
            'node_id' => $lowestLoadNode
        ]));

        // Generate RS256 token signing payload specifically for Mediasoup Worker validation
        $mediaToken = JwtService::generateMediaToken($request->user()->id, $room->uuid);

        return response()->json([
            'room' => $room,
            'participant' => $participant,
            'node_id' => $lowestLoadNode,
            'media_token' => $mediaToken
        ]);
    }

    public function leave(Request $request, $uuid)
    {
        $room = Room::where('uuid', $uuid)->firstOrFail();

        $participant = RoomParticipant::where('room_id', $room->id)
            ->where('user_id', $request->user()->id)
            ->first();

        if ($participant) {
            $participant->update(['left_at' => now()]);
            
            Redis::publish('signalcore:events', json_encode([
                'type' => 'USER_LEFT',
                'room_id' => $room->uuid,
                'user_id' => $request->user()->id,
                'node_id' => $participant->node_id
            ]));
        }

        return response()->json(['message' => 'Left room successfully.']);
    }

    private function getLeastLoadedNode(): ?string
    {
        $nodes = Redis::keys('signalcore:node:*:metrics');
        if (empty($nodes)) {
            return null;
        }

        $selectedNode = null;
        $lowestCpu = PHP_INT_MAX;

        foreach ($nodes as $key) {
            $metricsJson = Redis::get($key);
            if ($metricsJson) {
                $metrics = json_decode($metricsJson, true);
                if (isset($metrics['cpu_usage']) && $metrics['cpu_usage'] < $lowestCpu && $metrics['cpu_usage'] <= 85) {
                    $lowestCpu = $metrics['cpu_usage'];
                    $selectedNode = $metrics['node_id'] ?? null;
                }
            }
        }

        return $selectedNode;
    }
}
