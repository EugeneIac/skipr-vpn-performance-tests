FROM alpine:3.18

# Установка OpenVPN и зависимостей
RUN apk add --no-cache \
    openvpn \
    bash \
    curl \
    iproute2 \
    iptables \
    net-tools

# Создание директорий
RUN mkdir -p /etc/openvpn/configs /etc/openvpn/auth /var/log/openvpn

# Копирование скриптов
COPY entrypoint.sh /entrypoint.sh
COPY healthcheck.sh /healthcheck.sh

RUN chmod +x /entrypoint.sh /healthcheck.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /healthcheck.sh

ENTRYPOINT ["/entrypoint.sh"]
