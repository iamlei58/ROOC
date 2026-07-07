<?php

$root = dirname(__DIR__);
$envPath = $root . '/.env';

if (!is_file($envPath)) {
    fwrite(STDERR, "Missing .env. Copy .env.example to .env first.\n");
    exit(1);
}

$env = [];
foreach (file($envPath, FILE_IGNORE_NEW_LINES) as $line) {
    $line = trim($line);
    if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
        continue;
    }

    [$key, $value] = explode('=', $line, 2);
    $env[trim($key)] = trim(trim($value), "\"'");
}

$url = $env['SUPABASE_URL'] ?? '';
$anonKey = $env['SUPABASE_ANON_KEY'] ?? '';
$testUrl = $env['SUPABASE_TEST_URL'] ?? '';
$testAnonKey = $env['SUPABASE_TEST_ANON_KEY'] ?? '';
$testLabel = $env['SUPABASE_TEST_LABEL'] ?? '測試資料庫 rooc_test';

if ($url === '' || $anonKey === '') {
    fwrite(STDERR, "SUPABASE_URL and SUPABASE_ANON_KEY are required.\n");
    exit(1);
}

$hasPartialTestConfig = ($testUrl === '') !== ($testAnonKey === '');
if ($hasPartialTestConfig) {
    fwrite(STDERR, "SUPABASE_TEST_URL and SUPABASE_TEST_ANON_KEY must be set together.\n");
    exit(1);
}

$config = [
    'defaultEnvironment' => 'production',
    'environments' => [
        'production' => [
            'label' => '正式資料庫',
            'url' => $url,
            'anonKey' => $anonKey,
        ],
    ],
];

if ($testUrl !== '' && $testAnonKey !== '') {
    $config['environments']['rooc_test'] = [
        'label' => $testLabel,
        'url' => $testUrl,
        'anonKey' => $testAnonKey,
    ];
}

$json = json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
file_put_contents($root . '/config.local.js', "window.ROOC_SUPABASE_CONFIG = {$json};\n");

fwrite(STDOUT, "Wrote config.local.js\n");
