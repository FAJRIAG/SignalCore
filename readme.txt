Bertindak sebagai Principal Software Engineer dengan keahlian dalam distributed systems, real-time communication (WebRTC), dan scalable backend architecture.

Saya ingin membangun sistem video conferencing berbasis web bernama "SignalCore" — sebuah real-time communication platform yang mendekati konsep Google Meet, dengan fokus pada performa, skalabilitas, dan clean architecture.

TECH STACK:

* Backend: Laravel 12 (REST API + WebSocket signaling)
* Frontend: React.js (atau Vanilla JS jika minimal)
* Real-time communication: WebRTC
* WebSocket: Laravel WebSockets (self-hosted)
* Media server (scaling): mediasoup (SFU)
* STUN: Google STUN
* TURN: Coturn (mandatory untuk production)
* Deployment: Docker + Nginx + HTTPS

TUJUAN SISTEM:

* Multi-user video conferencing (5–20 user per room)
* Low latency (<300ms)
* Stabil di berbagai network (NAT traversal)
* Modular, scalable, dan extensible
* Siap dikembangkan ke fitur lanjutan (screen sharing, recording, chat)

TUGAS ANDA:

1. SYSTEM ARCHITECTURE

* Rancang arsitektur lengkap:

  * Client (browser)
  * Laravel backend (API + signaling)
  * WebSocket server
  * SFU (mediasoup)
  * TURN server
* Jelaskan alur:

  * user join room
  * signaling (SDP + ICE)
  * media flow melalui SFU

2. BACKEND IMPLEMENTATION (LARAVEL)

* Gunakan clean architecture:

  * Controller → Service → Repository
* Fitur:

  * Authentication (JWT/Sanctum)
  * Room management (create, join, leave)
  * Broadcasting signaling events
* Konfigurasi:

  * broadcasting.php
  * queue & worker
  * WebSocket setup

3. SIGNALING DESIGN

* Implement event:

  * user-joined
  * offer
  * answer
  * ice-candidate
* Pastikan event low-latency & real-time

4. FRONTEND (WEBRTC CLIENT)

* Implement:

  * getUserMedia
  * RTCPeerConnection
  * track handling
* Integrasi dengan signaling server
* State management untuk multi-user

5. SFU (MEDIASOUP)

* Setup mediasoup server
* Implement:

  * producer (publish stream)
  * consumer (receive stream)
* Integrasi signaling dengan Laravel

6. TURN SERVER

* Setup Coturn
* Konfigurasi credential
* Integrasi ke ICE server di WebRTC

7. DEPLOYMENT

* Dockerize semua service:

  * Laravel
  * WebSocket
  * mediasoup
  * Coturn
* Setup Nginx reverse proxy
* HTTPS (required untuk WebRTC)

8. ERROR HANDLING

* ICE connection failed
* Reconnection strategy
* Camera/mic permission denied
* Network switching

9. PERFORMANCE & SCALING

* Analisis Mesh vs SFU
* Optimasi bandwidth
* Horizontal scaling strategy

10. SECURITY

* Authenticated signaling
* Room access control
* Token validation
* Prevent unauthorized join

BATASAN:

* Jangan gunakan layanan SaaS seperti Twilio atau Agora
* Fokus pada open-source stack
* Jangan berikan teori tanpa implementasi

OUTPUT YANG DIHARAPKAN:

* Arsitektur lengkap (diagram teks)
* Kode modular siap jalan (backend + frontend)
* Step-by-step setup & deployment
* Best practices production

TUJUAN AKHIR:
Membangun sistem "SignalCore" sebagai fondasi platform real-time communication yang scalable, robust, dan siap dikembangkan ke level enterprise.
