#!/usr/bin/php -q
<?php
/**
 * aiPBX Remote Asterisk API
 * Handles SIP URI and SIP Trunk management on the Asterisk server.
 * Supports both chan_sip and chan_pjsip technologies.
 */

ini_set('display_errors', 0);

define('AC_HOST', '127.0.0.1');
define('AC_PORT', 5038);
define('LOG_FILE', 'api.log');
define('AC_CFG_DIR', '/etc/asterisk/custom');
define('AC_DB_CS', 'mysql:host=localhost;port=3306;dbname=krasterisk;charset=utf8');
define('AC_DB_UNAME', 'krasterisk');
define('AC_DB_UPASS', 'gfhjkm');
define('AC_AMI_UNAME', 'krasterisk');
define('AC_AMI_UPASS', 'CO9mDzn7?KfW');
define('CONTEXT', 'e1-in');
define('AC_TIME_DELTA', 0);
define('AC_TIMEOUT', 0.75);

// --- Read JSON request body (from NestJS) ---
$rawInput = file_get_contents('php://input');
$decodedJson = json_decode($rawInput, true);

if (json_last_error() === JSON_ERROR_NONE && is_array($decodedJson)) {
    $_REQUEST = array_merge($_REQUEST, $decodedJson);
    $request = $_REQUEST;
} else {
    logging(['invalid_json' => $rawInput]);
    error('400', 'Invalid JSON in request body');
}

// Mask passwords in logs
$logRequest = $request;
if (isset($logRequest['password'])) {
    $logRequest['password'] = '***';
}
if (isset($logRequest['secret'])) {
    $logRequest['secret'] = '***';
}
logging($logRequest);

// --- Validate required fields based on action ---
if (empty($request['action'])) {
    error('400', 'Missing action');
}
$action = strval($request['action']);

// --- Token validation ---
if (!empty($request['assistantId']) && !empty($request['sipServerAddress']) && !empty($request['serverId'])) {
    $identifier = $request['authName'] ?? $request['name'] ?? $request['assistantUniqueId'] ?? '';
    $sipServerAddress = $request['sipServerAddress'];
    $serverId = $request['serverId'];
    $userId = $request['userId'] ?? '';
    $token = hash('sha256', "{$identifier}:{$sipServerAddress}:{$serverId}:{$userId}");
    checkBearerToken($token);
} elseif (!empty($request['assistantId']) && !empty($request['ipAddress']) && !empty($request['serverId'])) {
    // Legacy: SIP URI actions
    $assistantId = $request['assistantId'];
    $ipAddress = $request['ipAddress'];
    $serverId = $request['serverId'];
    $userId = $request['userId'] ?? '';
    $token = hash('sha256', "{$assistantId}:{$ipAddress}:{$serverId}:{$userId}");
    checkBearerToken($token);
}

// --- AMI Login ---
$loginArr = array(
    'Action' => 'Login',
    'username' => AC_AMI_UNAME,
    'secret' => AC_AMI_UPASS,
    'Events' => 'off',
);

$resp = asterisk_req($loginArr, true);
if ($resp[0]['response'] !== 'Success') {
    error('403', ['ami_status' => 'error', 'data' => $resp[0]]);
}

// --- Route actions ---
switch ($action) {
    // Legacy SIP URI actions
    case 'createSipUri':
        $assistantId = $request['assistantId'] ?? '';
        $ipAddress = $request['ipAddress'] ?? '';
        $serverId = $request['serverId'] ?? '';
        $userId = $request['userId'] ?? '';
        $active = filter_var($request['active'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $records = filter_var($request['records'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $sipTechnology = $request['sipTechnology'] ?? 'pjsip';
        createSipUri($assistantId, $ipAddress, $serverId, $userId, $active, $records, $sipTechnology);
        break;

    case 'deleteSipUri':
        $assistantId = $request['assistantId'] ?? '';
        $ipAddress = $request['ipAddress'] ?? '';
        $serverId = $request['serverId'] ?? '';
        $userId = $request['userId'] ?? '';
        deleteSipUri($assistantId, $ipAddress, $serverId, $userId);
        break;

    // New SIP Trunk actions
    case 'createSipTrunk':
        createSipTrunk($request);
        break;

    case 'updateSipTrunk':
        updateSipTrunk($request);
        break;

    case 'deleteSipTrunk':
        deleteSipTrunk($request);
        break;

    case 'statusSipTrunk':
        statusSipTrunk($request);
        break;

    case 'get_info':
        answer(['status' => 'ok', 'version' => '2.0']);
        break;

    default:
        error('400', 'Unknown action: ' . $action);
}

// =====================================================================
// SIP TRUNK FUNCTIONS
// =====================================================================

/**
 * Create SIP trunk config files + dialplan on Asterisk server
 */
function createSipTrunk(array $request)
{
    $trunkId = $request['trunkId'] ?? '';
    $assistantUniqueId = $request['assistantUniqueId'] ?? '';
    $trunkType = $request['trunkType'] ?? 'registration';
    $sipTechnology = $request['sipTechnology'] ?? 'pjsip';
    $sipServerAddress = $request['sipServerAddress'] ?? '';
    $transport = $request['transport'] ?? 'udp';
    $authName = $request['authName'] ?? '';
    $password = $request['password'] ?? '';
    $domain = $request['domain'] ?? '';
    $callerId = $request['callerId'] ?? '';
    $providerIp = $request['providerIp'] ?? '';
    $active = filter_var($request['active'] ?? true, FILTER_VALIDATE_BOOLEAN);
    $records = filter_var($request['records'] ?? false, FILTER_VALIDATE_BOOLEAN);
    $context = $request['context'] ?? CONTEXT;
    $recordFormat = $request['recordFormat'] ?? 'wav';

    if (empty($trunkId))
        error('400', 'Missing trunkId');
    if (empty($assistantUniqueId))
        error('400', 'Missing assistantUniqueId');
    if (empty($sipServerAddress))
        error('400', 'Missing sipServerAddress');

    $trunkName = "trunk_{$assistantUniqueId}_{$trunkId}";

    // Ensure directories exist
    $trunkDir = AC_CFG_DIR . '/trunks';
    $dialplanDir = AC_CFG_DIR . '/assistants';
    if (!is_dir($trunkDir))
        mkdir($trunkDir, 0775, true);
    if (!is_dir($dialplanDir))
        mkdir($dialplanDir, 0775, true);

    // Parse host:port from sipServerAddress
    $parts = explode(':', $sipServerAddress);
    $sipHost = $parts[0];
    $sipPort = $parts[1] ?? '5060';

    // --- Generate trunk config ---
    $trunkContent = '';
    if ($active) {
        if ($sipTechnology === 'pjsip') {
            $trunkContent = generatePjsipTrunkConfig($trunkName, $trunkType, $sipServerAddress, $transport, $authName, $password, $domain, $callerId, $providerIp, $context);
        } else {
            $trunkContent = generateSipTrunkConfig($trunkName, $trunkType, $sipHost, $sipPort, $transport, $authName, $password, $domain, $callerId, $providerIp, $context, $assistantUniqueId);
        }
    }

    // --- Generate dialplan ---
    $dialplanContent = '';
    if ($active) {
        $dialplanContent = generateDialplan(
            $assistantUniqueId,
            $records,
            $recordFormat,
            $context,
            $trunkName,
            $trunkId
            // ipAddress intentionally empty — no header check for SIP trunks
        );
    }

    // Write trunk config
    $trunkFile = "{$trunkDir}/{$trunkName}_{$sipTechnology}.conf";
    if (file_put_contents($trunkFile, $trunkContent) === false) {
        error('500', 'Cannot write trunk config file');
    }

    // Write dialplan
    $dialplanFile = "{$dialplanDir}/assistant_{$assistantUniqueId}_{$trunkId}_dialplan.conf";
    if (file_put_contents($dialplanFile, $dialplanContent) === false) {
        error('500', 'Cannot write dialplan config file');
    }

    // Reload Asterisk
    reloadSipModule($sipTechnology);
    reloadAsteriskDialplan();

    logging([
        "SIP Trunk created" => $trunkName,
        'sipTechnology' => $sipTechnology,
        'trunkType' => $trunkType,
        'trunkFile' => $trunkFile,
        'dialplanFile' => $dialplanFile,
    ]);

    answer([
        'status' => 'success',
        'trunkName' => $trunkName,
        'sipTechnology' => $sipTechnology,
        'trunkFile' => basename($trunkFile),
        'dialplanFile' => basename($dialplanFile),
    ]);
}

/**
 * Update SIP trunk = delete old files + create new ones
 */
function updateSipTrunk(array $request)
{
    // Delete existing config (silently)
    $trunkId = $request['trunkId'] ?? '';
    $assistantUniqueId = $request['assistantUniqueId'] ?? '';
    $sipTechnology = $request['sipTechnology'] ?? 'pjsip';

    if (empty($trunkId) || empty($assistantUniqueId)) {
        error('400', 'Missing trunkId or assistantUniqueId');
    }

    $trunkName = "trunk_{$assistantUniqueId}_{$trunkId}";
    $trunkDir = AC_CFG_DIR . '/trunks';
    $dialplanDir = AC_CFG_DIR . '/assistants';

    // Remove old files (both sip and pjsip, in case technology changed)
    @unlink("{$trunkDir}/{$trunkName}_sip.conf");
    @unlink("{$trunkDir}/{$trunkName}_pjsip.conf");
    @unlink("{$dialplanDir}/assistant_{$assistantUniqueId}_{$trunkId}_dialplan.conf");

    // Recreate with new parameters
    createSipTrunk($request);
}

/**
 * Delete SIP trunk config files + dialplan
 */
function deleteSipTrunk(array $request)
{
    $trunkId = $request['trunkId'] ?? '';
    $assistantUniqueId = $request['assistantUniqueId'] ?? '';
    $sipTechnology = $request['sipTechnology'] ?? 'pjsip';

    if (empty($trunkId))
        error('400', 'Missing trunkId');
    if (empty($assistantUniqueId))
        error('400', 'Missing assistantUniqueId');

    $trunkName = "trunk_{$assistantUniqueId}_{$trunkId}";
    $trunkDir = AC_CFG_DIR . '/trunks';
    $dialplanDir = AC_CFG_DIR . '/assistants';

    // Remove all possible config files
    $deleted = [];
    $files = [
        "{$trunkDir}/{$trunkName}_sip.conf",
        "{$trunkDir}/{$trunkName}_pjsip.conf",
        "{$dialplanDir}/assistant_{$assistantUniqueId}_{$trunkId}_dialplan.conf",
    ];

    foreach ($files as $file) {
        if (file_exists($file)) {
            if (unlink($file)) {
                $deleted[] = basename($file);
            }
        }
    }

    // Reload
    reloadSipModule($sipTechnology);
    reloadAsteriskDialplan();

    logging([
        "SIP Trunk deleted" => $trunkName,
        'deletedFiles' => $deleted,
    ]);

    answer([
        'status' => 'success',
        'message' => 'SIP Trunk configuration deleted',
        'trunkName' => $trunkName,
        'deletedFiles' => $deleted,
    ]);
}

/**
 * Get SIP trunk registration status via AMI
 */
function statusSipTrunk(array $request)
{
    $trunkId = $request['trunkId'] ?? '';
    $assistantUniqueId = $request['assistantUniqueId'] ?? '';
    $sipTechnology = $request['sipTechnology'] ?? 'pjsip';
    $trunkType = $request['trunkType'] ?? 'registration';
    $authName = $request['authName'] ?? '';
    $sipServerAddress = $request['sipServerAddress'] ?? '';

    if (empty($trunkId))
        error('400', 'Missing trunkId');
    if (empty($assistantUniqueId))
        error('400', 'Missing assistantUniqueId');

    $trunkName = "trunk_{$assistantUniqueId}_{$trunkId}";

    if ($trunkType === 'registration') {
        if ($sipTechnology === 'pjsip') {
            // PJSIP: use CLI command to check specific registration
            $resp = asterisk_req([
                'Action' => 'Command',
                'Command' => "pjsip show registration {$trunkName}_reg",
            ], false);

            $state = 'Unknown';
            if (isset($resp[0]['output'])) {
                $output = is_array($resp[0]['output']) ? implode("\n", $resp[0]['output']) : $resp[0]['output'];
                if (preg_match('/State:\s*(\S+)/i', $output, $m)) {
                    $state = $m[1];
                }
            }

            answer([
                'status' => 'success',
                'trunkName' => $trunkName,
                'registered' => (strtolower($state) === 'registered'),
                'state' => $state,
                'sipTechnology' => 'pjsip',
            ]);

        } else {
            // SIP: use AMI Action SIPshowregistry (structured, not truncated)
            $resp = asterisk_req([
                'Action' => 'SIPshowregistry',
            ], false);

            // Parse host:port from sipServerAddress
            $parts = explode(':', $sipServerAddress);
            $matchHost = $parts[0] ?? '';
            $matchPort = $parts[1] ?? '5060';

            $found = false;
            $state = 'Unregistered';

            foreach ($resp as $event) {
                if (!isset($event['event']))
                    continue;
                if (strtolower($event['event']) !== 'registryentry')
                    continue;

                $host = $event['host'] ?? '';
                $port = $event['port'] ?? '5060';
                $username = $event['username'] ?? '';

                // Match by Host + Port + Username
                if ($host === $matchHost && $port == $matchPort && $username === $authName) {
                    $state = $event['state'] ?? 'Unknown';
                    $found = true;
                    break;
                }
            }

            answer([
                'status' => 'success',
                'trunkName' => $trunkName,
                'registered' => (strtolower($state) === 'registered'),
                'state' => $state,
                'found' => $found,
                'sipTechnology' => 'sip',
            ]);
        }
    } else {
        // IP trunk — just check if peer/endpoint is reachable
        if ($sipTechnology === 'pjsip') {
            $resp = asterisk_req([
                'Action' => 'Command',
                'Command' => "pjsip show endpoint {$trunkName}",
            ], false);

            $online = false;
            if (isset($resp[0]['output'])) {
                $output = is_array($resp[0]['output']) ? implode("\n", $resp[0]['output']) : $resp[0]['output'];
                $online = (strpos($output, 'Not in use') !== false || strpos($output, 'In use') !== false || strpos($output, 'Avail') !== false);
            }

            answer([
                'status' => 'success',
                'trunkName' => $trunkName,
                'online' => $online,
                'sipTechnology' => 'pjsip',
                'trunkType' => 'ip',
            ]);
        } else {
            $resp = asterisk_req([
                'Action' => 'Command',
                'Command' => "sip show peer {$trunkName}",
            ], false);

            $online = false;
            if (isset($resp[0]['output'])) {
                $output = is_array($resp[0]['output']) ? implode("\n", $resp[0]['output']) : $resp[0]['output'];
                $online = (strpos($output, 'OK (') !== false);
            }

            answer([
                'status' => 'success',
                'trunkName' => $trunkName,
                'online' => $online,
                'sipTechnology' => 'sip',
                'trunkType' => 'ip',
            ]);
        }
    }
}

// =====================================================================
// CONFIG GENERATORS
// =====================================================================

/**
 * Generate PJSIP trunk configuration
 */
function generatePjsipTrunkConfig(string $trunkName, string $trunkType, string $sipServerAddress, string $transport, string $authName, string $password, string $domain, string $callerId, string $providerIp, string $context): string
{
    $content = '';

    if ($trunkType === 'registration') {
        // Endpoint
        $content .= "[{$trunkName}]\n";
        $content .= "type=endpoint\n";
        $content .= "context={$context}\n";
        $content .= "disallow=all\n";
        $content .= "allow=alaw,ulaw\n";
        $content .= "outbound_auth={$trunkName}_auth\n";
        $content .= "aors={$trunkName}\n";
        if (!empty($callerId))
            $content .= "callerid={$callerId}\n";
        if (!empty($authName))
            $content .= "from_user={$authName}\n";
        if (!empty($domain))
            $content .= "from_domain={$domain}\n";
        $content .= "\n";

        // Auth
        $content .= "[{$trunkName}_auth]\n";
        $content .= "type=auth\n";
        $content .= "auth_type=userpass\n";
        $content .= "username={$authName}\n";
        $content .= "password={$password}\n";
        $content .= "\n";

        // AOR
        $content .= "[{$trunkName}]\n";
        $content .= "type=aor\n";
        $content .= "contact=sip:{$sipServerAddress}\n";
        $content .= "qualify_frequency=60\n";
        $content .= "\n";

        // Registration
        $regDomain = !empty($domain) ? $domain : explode(':', $sipServerAddress)[0];
        $content .= "[{$trunkName}_reg]\n";
        $content .= "type=registration\n";
        $content .= "outbound_auth={$trunkName}_auth\n";
        $content .= "server_uri=sip:{$sipServerAddress}\n";
        $content .= "client_uri=sip:{$authName}@{$regDomain}\n";
        $content .= "retry_interval=60\n";

    } else {
        // IP trunk - endpoint
        $content .= "[{$trunkName}]\n";
        $content .= "type=endpoint\n";
        $content .= "context={$context}\n";
        $content .= "disallow=all\n";
        $content .= "allow=alaw,ulaw\n";
        $content .= "aors={$trunkName}\n";
        if (!empty($callerId))
            $content .= "callerid={$callerId}\n";
        $content .= "\n";

        // AOR
        $content .= "[{$trunkName}]\n";
        $content .= "type=aor\n";
        $content .= "contact=sip:{$sipServerAddress}\n";
        $content .= "qualify_frequency=60\n";
        $content .= "\n";

        // Identify (ACL)
        if (!empty($providerIp)) {
            $content .= "[{$trunkName}_acl]\n";
            $content .= "type=identify\n";
            $content .= "endpoint={$trunkName}\n";
            $content .= "match={$providerIp}\n";
        }
    }

    return $content;
}

/**
 * Generate chan_sip trunk configuration
 */
function generateSipTrunkConfig(string $trunkName, string $trunkType, string $sipHost, string $sipPort, string $transport, string $authName, string $password, string $domain, string $callerId, string $providerIp, string $context, string $assistantUniqueId): string
{
    $content = "[{$trunkName}]\n";
    $content .= "type=peer\n";

    if ($trunkType === 'registration') {
        $content .= "host={$sipHost}\n";
        if ($sipPort !== '5060')
            $content .= "port={$sipPort}\n";
        $content .= "username={$authName}\n";
        $content .= "secret={$password}\n";
        $content .= "fromuser={$authName}\n";
        if (!empty($domain))
            $content .= "fromdomain={$domain}\n";
        $content .= "context={$context}\n";
        $content .= "insecure=invite,port\n";
        $content .= "transport={$transport}\n";
        $content .= "qualify=yes\n";
        $content .= "disallow=all\n";
        $content .= "allow=alaw,ulaw\n";
        $content .= "callbackextension={$assistantUniqueId}\n";
    } else {
        // IP trunk
        if (!empty($providerIp)) {
            $content .= "host={$providerIp}\n";
        } else {
            $content .= "host={$sipHost}\n";
        }
        $content .= "context={$context}\n";
        $content .= "insecure=invite,port\n";
        $content .= "transport={$transport}\n";
        $content .= "qualify=yes\n";
        $content .= "disallow=all\n";
        $content .= "allow=alaw,ulaw\n";
    }

    return $content;
}

/**
 * Unified dialplan generator for both SIP URI and SIP Trunk.
 * IP validation (if ipAddress is set) is handled inside the dialplan via GotoIf,
 * so a single generated file works for both modes.
 */
function generateDialplan(
    string $assistantUniqueId,
    bool $records,
    string $recordFormat = 'wav',
    string $context = '',
    string $trunkName = '',
    string $trunkId = '',
    string $ipAddress = '',
    string $sipTechnology = 'pjsip'
): string {
    if (empty($context))
        $context = CONTEXT;
    $label = !empty($trunkName) ? $trunkName : $assistantUniqueId;

    $content = "[{$context}]\n";
    $content .= "exten => {$assistantUniqueId},1,NoOp(Incoming call on {$label})\n";

    // Set allowed IP (empty = skip check)
    $content .= "same => n,Set(ip=" . ($ipAddress ?: '') . ")\n";
    // If ip is empty, skip the header check entirely
    $content .= 'same => n,GotoIf($["${ip}" = ""]?answer)' . "\n";

    // Read Contact header based on technology
    if ($sipTechnology === 'pjsip') {
        $content .= 'same => n,Set(c=${PJSIP_HEADER(read,Contact)})' . "\n";
    } else {
        $content .= 'same => n,Set(c=${SIP_HEADER(contact,1)})' . "\n";
    }
    $content .= 'same => n,Set(extracted_ip=$["${c}" : ".*sip:([0-9\.]+)"])' . "\n";
    $content .= 'same => n,ExecIf($["${extracted_ip}" != "${ip}"]?Hangup())' . "\n";

    // Label: answer
    $content .= "same => n(answer),Answer()\n";

    // Trunk ID (for SipTrunk mode)
    if (!empty($trunkId)) {
        $content .= "same => n,Set(__TRUNK_ID={$trunkId})\n";
    }

    // Recording
    if ($records) {
        $content .= 'same => n,Set(__fname=/usr/records/assistants/' . $assistantUniqueId . '/${UNIQUEID})' . "\n";
        $content .= 'same => n,Set(__monopt=nice /usr/bin/lame -b 16 --resample 32 -q5 --silent "${fname}.wav" "${fname}.mp3" && rm -f "${fname}.wav")' . "\n";
        $content .= 'same => n,MixMonitor(${fname}.wav,,${monopt})' . "\n";
    }

    $content .= "same => n,Stasis(aiPBXBot,{$assistantUniqueId})\n";
    $content .= "same => n,Hangup()\n";

    return $content;
}

// =====================================================================
// LEGACY SIP URI FUNCTIONS
// =====================================================================

function createSipUri($assistantId, $ipAddress, $serverId, $userId, $active, $records, $sipTechnology = 'pjsip')
{
    if (empty($assistantId))
        error('400', 'Missing assistant id');
    if (empty($serverId))
        error('400', 'Missing server id');
    if (empty($ipAddress))
        error('400', 'Missing client ip address');

    $configDir = AC_CFG_DIR . '/assistants';
    if (!is_dir($configDir))
        mkdir($configDir, 0775, true);

    $filename = "{$configDir}/assistant_{$assistantId}.conf";
    $content = '';

    if ($active) {
        // Use unified generateDialplan with ipAddress for IP header check
        $content = generateDialplan(
            $assistantId,
            $records,
            'wav',
            CONTEXT,
            '',         // trunkName — not used for SipUri
            '',         // trunkId  — not used for SipUri
            $ipAddress, // enables IP header validation
            $sipTechnology
        );
    }

    if (file_put_contents($filename, $content) === false) {
        error('500', 'Cannot write trunk config file');
    }

    $reloadResult = reloadAsteriskDialplan();

    logging([
        "SIP URI for {$assistantId} created" => $filename,
        'ipAddress' => $ipAddress,
        'sipTechnology' => $sipTechnology,
        'dialplan_reload' => $reloadResult ? 'success' : 'failed',
    ]);

    answer([
        'status' => 'success',
        'ipAddress' => $ipAddress,
        'assistantId' => $assistantId,
        'sipTechnology' => $sipTechnology,
        'dialplan_reloaded' => $reloadResult,
    ]);
}

function deleteSipUri($assistantId, $serverId = null, $ipAddress = null, $userId = null)
{
    if (empty($assistantId))
        error('400', 'Missing assistant id');

    $configDir = AC_CFG_DIR . '/assistants';
    $filename = "{$configDir}/assistant_{$assistantId}.conf";

    if (!file_exists($filename)) {
        answer([
            'status' => 'success',
            'message' => 'Configuration file not found or already deleted',
            'assistantId' => $assistantId,
        ]);
        return;
    }

    if (unlink($filename)) {
        $reloadResult = reloadAsteriskDialplan();
        logging(["SIP URI for {$assistantId} deleted" => $filename]);
        answer([
            'status' => 'success',
            'message' => 'SIP URI configuration deleted successfully',
            'assistantId' => $assistantId,
            'dialplan_reloaded' => $reloadResult,
        ]);
    } else {
        error('500', 'Cannot delete trunk config file');
    }
}

// =====================================================================
// AMI / RELOAD HELPERS
// =====================================================================

/**
 * Reload SIP/PJSIP module via AMI
 */
function reloadSipModule(string $sipTechnology): bool
{
    $command = ($sipTechnology === 'pjsip') ? 'pjsip reload' : 'sip reload';

    $resp = asterisk_req([
        'Action' => 'Command',
        'Command' => $command,
    ], true);

    $success = (is_array($resp) && isset($resp[0]['response']) && $resp[0]['response'] === 'Success');
    logging(["{$sipTechnology} reload" => $success ? 'success' : 'failed']);
    return $success;
}

/**
 * Reload dialplan via AMI
 */
function reloadAsteriskDialplan(): bool
{
    $resp = asterisk_req([
        'Action' => 'Command',
        'Command' => 'dialplan reload',
    ], true);

    $success = (is_array($resp) && isset($resp[0]['response']) && $resp[0]['response'] === 'Success');
    logging(['Dialplan reload' => $success ? 'success' : 'failed']);
    return $success;
}

// =====================================================================
// AMI TRANSPORT LAYER
// =====================================================================

function asterisk_req($params, $quick = false)
{
    return !defined('AC_PREFIX') ? ami_req($params, $quick) : ajam_req($params);
}

function asterisk_socket_shutdown()
{
    ami_req(null);
}

function ami_req($params, $quick = true)
{
    static $connection;
    if ($params === null && $connection !== null) {
        fclose($connection);
        return;
    }
    if ($connection === null) {
        $en = $es = '';
        $connection = fsockopen(AC_HOST, AC_PORT, $en, $es, 30);
        if ($connection) {
            register_shutdown_function('asterisk_socket_shutdown');
        } else {
            $connection = null;
            return array(0 => array('response' => 'error', 'message' => 'socket_err:' . $en . '/' . $es));
        }
    }
    $str = array();
    foreach ($params as $k => $v)
        $str[] = "{$k}: {$v}";
    $str[] = '';
    $str = implode("\r\n", $str);
    fwrite($connection, $str . "\r\n");
    $seconds = ceil(AC_TIMEOUT);
    $ms = round((AC_TIMEOUT - $seconds) * 1000000);
    stream_set_timeout($connection, $seconds, $ms);
    $str = ami_read($connection, $quick);
    return rawman_parse($str);
}

function ami_read($connection, $quick = true)
{
    $str = '';
    do {
        $line = fgets($connection, 4096);
        $str .= $line;
        $info = stream_get_meta_data($connection);
        if ($quick && $line == "\r\n")
            break;
    } while ($info['timed_out'] == false);
    return $str;
}

function rawman_parse($lines)
{
    $lines = explode("\n", $lines);
    $messages = array();
    $message = array();
    foreach ($lines as $l) {
        $l = trim($l);
        if (empty($l) && count($message) > 0) {
            $messages[] = $message;
            $message = array();
            continue;
        }
        if (empty($l))
            continue;
        if (strpos($l, ':') === false)
            continue;
        list($k, $v) = explode(':', $l, 2);
        $k = strtolower(trim($k));
        $v = trim($v);
        if (!isset($message[$k]))
            $message[$k] = $v;
        elseif (!is_array($message[$k]))
            $message[$k] = array($message[$k], $v);
        else
            $message[$k][] = $v;
    }
    if (count($message) > 0)
        $messages[] = $message;
    return $messages;
}

function ajam_req($params)
{
    static $cookie;
    if ($cookie === null)
        $cookie = '';
    list($body, $cookie) = rq(AC_PREFIX . 'rawman?' . http_build_query($params), $cookie);
    return rawman_parse($body);
}

function rq($url, $cookie = '')
{
    $r = _rq($url, $cookie);
    list($headersRaw, $body) = explode("\r\n\r\n", $r, 2);
    $headersRaw = explode("\r\n", $headersRaw);
    $headers = array();
    foreach ($headersRaw as $h) {
        if (strpos($h, ':') === false)
            continue;
        list($hname, $hv) = explode(":", $h, 2);
        $headers[strtolower(trim($hname))] = trim($hv);
    }
    if (!empty($headers['set-cookie'])) {
        $listcookies = explode(';', $headers['set-cookie']);
        foreach ($listcookies as $c) {
            list($k, $v) = explode('=', trim($c), 2);
            if ($k == 'mansession_id')
                $cookie = $v;
        }
    }
    return array($body, $cookie);
}

function _rq($url, $cookie)
{
    $errno = $errstr = "";
    $fp = fsockopen(AC_HOST, AC_PORT, $errno, $errstr, 3);
    if (!$fp)
        return false;
    $out = "GET {$url} HTTP/1.1\r\n";
    $out .= "Host: " . AC_HOST . "\r\n";
    if (!empty($cookie))
        $out .= "Cookie: mansession_id={$cookie}\r\n";
    $out .= "Connection: Close\r\n\r\n";
    fwrite($fp, $out);
    $r = '';
    while (!feof($fp))
        $r .= fgets($fp);
    fclose($fp);
    return $r;
}

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================

function answer($array)
{
    header("Content-type: application/json; charset=utf-8");
    echo json_encode($array);
    die();
}

function error($code, $message)
{
    http_response_code((int) $code);
    $rawdata = [
        'statusCode' => $code,
        'message' => $message,
        'error' => true,
    ];
    logging($rawdata);
    header("Content-type: application/json; charset=utf-8");
    die(json_encode($rawdata));
}

function logging($data)
{
    $r = fopen(LOG_FILE, 'a+');
    fwrite($r, "\r\n");
    fwrite($r, date("Y-m-d H:i:s") . "(" . ($_SERVER['REMOTE_ADDR'] ?? 'cli') . "):\r\n");
    fwrite($r, print_r($data, true));
    fclose($r);
}

function checkBearerToken(string $expectedToken): void
{
    $headers = getRequestHeaders();
    $authHeader = $headers['Authorization'] ?? '';

    if (!preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        error('401', 'Missing Bearer token');
    }

    $token = trim($matches[1]);

    if ($token !== $expectedToken) {
        error('401', 'Invalid token');
    }
}

function getRequestHeaders(): array
{
    if (function_exists('getallheaders')) {
        return getallheaders();
    }
    $headers = [];
    foreach ($_SERVER as $name => $value) {
        if (str_starts_with($name, 'HTTP_')) {
            $key = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
            $headers[$key] = $value;
        }
    }
    return $headers;
}
