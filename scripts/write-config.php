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

if ($url === '' || $anonKey === '') {
    fwrite(STDERR, "SUPABASE_URL and SUPABASE_ANON_KEY are required.\n");
    exit(1);
}

$config = [
    'url' => $url,
    'anonKey' => $anonKey,
];

$json = json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
file_put_contents($root . '/config.local.js', "window.ROOC_SUPABASE_CONFIG = {$json};\n");

fwrite(STDOUT, "Wrote config.local.js\n");
