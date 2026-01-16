#!/bin/bash
set -e

# Переменные окружения
VPN_SERVER="${VPN_SERVER:-vpn.skipr.network}"
VPN_PORT="${VPN_PORT:-1194}"
CLIENT_ID="${CLIENT_ID:-$(hostname)}"
CONFIG_FILE="${CONFIG_FILE:-/etc/openvpn/configs/client.ovpn}"
AUTH_FILE="${AUTH_FILE:-/etc/openvpn/auth/credentials.txt}"

echo "========================================"
echo "VPN Client Simulator Starting"
echo "========================================"
echo "Client ID: ${CLIENT_ID}"
echo "VPN Server: ${VPN_SERVER}:${VPN_PORT}"
echo "Config: ${CONFIG_FILE}"
echo "========================================"

# Проверка наличия конфигурационного файла
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Configuration file not found at $CONFIG_FILE"
    echo "Creating default configuration..."

    cat > "$CONFIG_FILE" <<EOF
client
dev tun
proto udp
remote ${VPN_SERVER} ${VPN_PORT}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth SHA256
verb 3
auth-user-pass ${AUTH_FILE}
EOF
fi

# Проверка наличия credentials файла
if [ ! -f "$AUTH_FILE" ]; then
    echo "Error: Auth file not found at $AUTH_FILE"
    echo "Creating default credentials..."
    mkdir -p $(dirname "$AUTH_FILE")
    cat > "$AUTH_FILE" <<EOF
test_user_${CLIENT_ID}
test_password_123
EOF
fi

# Создание директории для логов
mkdir -p /var/log/openvpn

# Запуск OpenVPN с логированием
echo "Starting OpenVPN connection..."
openvpn \
    --config "$CONFIG_FILE" \
    --log /var/log/openvpn/client-${CLIENT_ID}.log \
    --status /var/log/openvpn/status-${CLIENT_ID}.txt 10 \
    --management localhost 7505 \
    --script-security 2

# Если OpenVPN завершился, логируем причину
EXIT_CODE=$?
echo "OpenVPN exited with code: ${EXIT_CODE}"
exit ${EXIT_CODE}
