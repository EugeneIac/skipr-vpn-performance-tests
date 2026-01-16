#!/bin/bash

# Health check скрипт для VPN client container

# Проверка, что процесс OpenVPN запущен
if ! pgrep -x openvpn > /dev/null; then
    echo "OpenVPN process not running"
    exit 1
fi

# Проверка наличия tun интерфейса
if ! ip link show tun0 > /dev/null 2>&1; then
    echo "TUN interface not found"
    exit 1
fi

# Проверка, что интерфейс UP
if ! ip link show tun0 | grep -q "state UP"; then
    echo "TUN interface is not UP"
    exit 1
fi

# Опционально: проверка connectivity через VPN
# Попытка пинга через VPN интерфейс
# if ! timeout 5 ping -c 1 -I tun0 8.8.8.8 > /dev/null 2>&1; then
#     echo "Cannot ping through VPN"
#     exit 1
# fi

echo "VPN client healthy"
exit 0
