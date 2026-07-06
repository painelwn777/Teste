<?php
// api/pix.php - Integração PIX EvoPay
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// ⚠️ CONFIGURAÇÕES
define('EVOPAY_TOKEN', 'a09622ac-7a72-4a23-a6e9-caff88bf0465');
define('EVOPAY_URL', 'https://api.evopay.cash/v1/pix/');
define('WEBHOOK_URL', 'https://pedro-emprestimo.onrender.com/api/pix.php?webhook=1'); // ⚠️ TROQUE PELO SEU DOMÍNIO HTTPS
define('TELEGRAM_TOKEN', '8314626965:AAE6tBJyGopYJTD46nR-6EhwunV849pVrX4');
define('TELEGRAM_CHAT', '8436758614');

$method = $_SERVER['REQUEST_METHOD'];
$file = __DIR__ . '/pix_transacoes.json';

// ============================================================
// 1) CRIAR COBRANÇA PIX
// ============================================================
if ($method === 'POST' && !isset($_GET['webhook'])) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $nome = preg_replace('/[^a-zA-ZÀ-ÿ0-9 ]/', '', $input['nome'] ?? 'Cliente');
    $protocolo = preg_replace('/[^A-Z0-9\-]/', '', $input['protocolo'] ?? 'EMP');
    $clientId = preg_replace('/[^a-z0-9_]/', '', $input['clientId'] ?? '');
    $valor = 250.00;

    $payload = [
        'amount' => $valor,
        'callbackUrl' => WEBHOOK_URL,
        'generatedName' => $nome,
        'expiresIn' => 86400,
        'clientReference' => $protocolo . '_' . $clientId
    ];

    $ch = curl_init(EVOPAY_URL);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'API-Key: ' . EVOPAY_TOKEN
        ]
    ]);
    $resp = curl_exec($ch);
    $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err || $http < 200 || $http >= 300) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'erro' => 'Falha na EvoPay: ' . ($err ?: "HTTP $http")]);
        exit;
    }

    $data = json_decode($resp, true);

    if (!isset($data['id']) || !isset($data['qrCodeText'])) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'erro' => 'Resposta inválida da EvoPay', 'raw' => $data]);
        exit;
    }

    // Salva transação localmente
    $transacoes = json_decode(@file_get_contents($file), true) ?: [];
    $transacoes[$data['id']] = [
        'id' => $data['id'],
        'protocolo' => $protocolo,
        'clientId' => $clientId,
        'nome' => $nome,
        'valor' => $valor,
        'status' => $data['status'] ?? 'PENDING',
        'qrCodeText' => $data['qrCodeText'],
        'qrCodeBase64' => $data['qrCodeBase64'] ?? null,
        'criado' => date('c')
    ];
    @file_put_contents($file, json_encode($transacoes, JSON_PRETTY_PRINT));

    echo json_encode([
        'ok' => true,
        'id' => $data['id'],
        'status' => $data['status'],
        'qrCode' => $data['qrCodeText'],
        'qrCodeBase64' => $data['qrCodeBase64'] ?? null,
        'qrCodeUrl' => $data['qrCodeUrl'] ?? null,
        'protocolo' => $protocolo
    ]);
    exit;
}

// ============================================================
// 2) CONSULTAR STATUS (polling do frontend)
// ============================================================
if ($method === 'GET' && isset($_GET['status'])) {
    $id = preg_replace('/[^A-Z0-9]/', '', $_GET['status']);
    $transacoes = json_decode(@file_get_contents($file), true) ?: [];
    
    if (isset($transacoes[$id])) {
        echo json_encode([
            'ok' => true,
            'id' => $id,
            'status' => $transacoes[$id]['status']
        ]);
    } else {
        echo json_encode(['ok' => false, 'erro' => 'Transação não encontrada']);
    }
    exit;
}

// ============================================================
// 3) WEBHOOK DA EVOPAY
// ============================================================
if (isset($_GET['webhook']) && $method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['id'])) {
        http_response_code(200);
        exit;
    }

    $transacoes = json_decode(@file_get_contents($file), true) ?: [];
    $id = $input['id'];

    if (isset($transacoes[$id])) {
        $transacoes[$id]['status'] = $input['status'];
        $transacoes[$id]['paidAt'] = $input['paidAt'] ?? null;
        $transacoes[$id]['payerName'] = $input['payerName'] ?? null;
        $transacoes[$id]['endToEndId'] = $input['endToEndId'] ?? null;
        $transacoes[$id]['atualizado'] = date('c');
        @file_put_contents($file, json_encode($transacoes, JSON_PRETTY_PRINT));

        // Notifica no Telegram se foi pago
        if ($input['status'] === 'COMPLETED') {
            $msg = "✅ *PIX PAGO - EVOPAY*\n\n" .
                   "👤 Cliente: " . ($transacoes[$id]['nome'] ?? 'N/I') . "\n" .
                   "💰 Valor: R$ " . number_format($input['amount'] ?? 0, 2, ',', '.') . "\n" .
                   "📋 Protocolo: " . ($transacoes[$id]['protocolo'] ?? 'N/I') . "\n" .
                   "🆔 ID EvoPay: $id\n" .
                   "🕐 Pago em: " . ($input['paidAt'] ?? date('d/m/Y H:i'));
            sendTelegram($msg);
        }
    }

    http_response_code(200);
    echo json_encode(['received' => true]);
    exit;
}

http_response_code(404);
echo json_encode(['ok' => false, 'erro' => 'Endpoint inválido']);

// ============================================================
function sendTelegram($texto) {
    $url = "https://api.telegram.org/bot" . TELEGRAM_TOKEN . "/sendMessage";
    $payload = [
        'chat_id' => TELEGRAM_CHAT,
        'text' => $texto,
        'parse_mode' => 'Markdown'
    ];
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 5
    ]);
    curl_exec($ch);
    curl_close($ch);
}