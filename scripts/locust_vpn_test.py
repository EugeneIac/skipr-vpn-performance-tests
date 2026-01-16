"""
Locust Load Testing Script для VPN Backend
Альтернатива k6 на Python

Запуск:
    locust -f locust_vpn_test.py --host=https://api.skipr.network

Web UI:
    http://localhost:8089
"""

from locust import HttpUser, task, between, events
from locust.exception import StopUser
import random
import time
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class VPNUser(HttpUser):
    """
    Симуляция пользователя VPN приложения
    """

    # Время ожидания между задачами (в секундах)
    wait_time = between(2, 5)

    # Переменные для хранения состояния пользователя
    token = None
    session_id = None
    user_id = None

    def on_start(self):
        """
        Вызывается при старте каждого виртуального пользователя
        Выполняет аутентификацию
        """
        self.user_id = f"user_{random.randint(1, 100000)}"
        self.authenticate()

    def on_stop(self):
        """
        Вызывается при остановке пользователя
        Выполняет disconnect если подключен
        """
        if self.session_id:
            self.disconnect()

    def authenticate(self):
        """
        Аутентификация пользователя
        """
        payload = {
            "username": self.user_id,
            "password": "test_password_123",
            "deviceId": f"android_device_{random.randint(1, 10000)}",
            "deviceType": "android",
            "appVersion": "1.0.0"
        }

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Skipr-Android/1.0.0"
        }

        with self.client.post(
            "/auth/login",
            json=payload,
            headers=headers,
            catch_response=True,
            name="Auth: Login"
        ) as response:
            if response.status_code == 200:
                try:
                    data = response.json()
                    self.token = data.get("token")
                    if self.token:
                        response.success()
                        logger.info(f"User {self.user_id} authenticated successfully")
                    else:
                        response.failure("No token in response")
                        raise StopUser()
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
                    raise StopUser()
            else:
                response.failure(f"Authentication failed: {response.status_code}")
                raise StopUser()

    def get_auth_headers(self):
        """
        Возвращает headers с токеном аутентификации
        """
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}",
            "User-Agent": "Skipr-Android/1.0.0"
        }

    @task(1)
    def get_server_list(self):
        """
        Получение списка доступных VPN серверов
        """
        with self.client.get(
            "/vpn/servers",
            headers=self.get_auth_headers(),
            catch_response=True,
            name="VPN: Get Server List"
        ) as response:
            if response.status_code == 200:
                try:
                    servers = response.json().get("servers", [])
                    if servers:
                        response.success()
                    else:
                        response.failure("Empty server list")
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            else:
                response.failure(f"Failed to get servers: {response.status_code}")

    @task(1)
    def get_vpn_config(self):
        """
        Получение VPN конфигурации
        """
        with self.client.get(
            "/vpn/config",
            headers=self.get_auth_headers(),
            catch_response=True,
            name="VPN: Get Config"
        ) as response:
            if response.status_code == 200:
                try:
                    config = response.json().get("ovpn")
                    if config:
                        response.success()
                    else:
                        response.failure("No config in response")
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            else:
                response.failure(f"Failed to get config: {response.status_code}")

    @task(3)
    def connect_to_vpn(self):
        """
        Основной сценарий: подключение к VPN
        Weight=3 означает, что этот task выполняется чаще других
        """
        # 1. Get server list
        self.get_server_list()
        time.sleep(1)

        # 2. Get config
        self.get_vpn_config()
        time.sleep(1)

        # 3. Connect
        connect_start = time.time()
        payload = {
            "serverId": f"server_{random.randint(1, 5)}",
            "protocol": "openvpn",
            "deviceId": f"android_device_{random.randint(1, 10000)}"
        }

        with self.client.post(
            "/vpn/connect",
            json=payload,
            headers=self.get_auth_headers(),
            catch_response=True,
            name="VPN: Connect"
        ) as response:
            connect_time = (time.time() - connect_start) * 1000  # в миллисекундах

            if response.status_code in [200, 201]:
                try:
                    data = response.json()
                    self.session_id = data.get("sessionId")
                    if self.session_id:
                        response.success()
                        logger.info(
                            f"User {self.user_id} connected in {connect_time:.0f}ms"
                        )

                        # Record custom metric
                        events.request.fire(
                            request_type="CUSTOM",
                            name="VPN Connection Time",
                            response_time=connect_time,
                            response_length=0,
                            exception=None,
                            context={}
                        )
                    else:
                        response.failure("No session ID in response")
                        return
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
                    return
            else:
                response.failure(f"Connection failed: {response.status_code}")
                return

        # 4. Simulate active connection with heartbeats
        connection_duration = random.randint(60, 300)  # 60-300 seconds
        heartbeat_interval = 30
        heartbeats = connection_duration // heartbeat_interval

        for _ in range(heartbeats):
            time.sleep(heartbeat_interval)
            self.send_heartbeat()

        # 5. Get stats
        self.get_connection_stats()
        time.sleep(2)

        # 6. Disconnect
        self.disconnect()

    @task(2)
    def send_heartbeat(self):
        """
        Отправка heartbeat для поддержания соединения
        """
        if not self.session_id:
            return

        payload = {
            "sessionId": self.session_id
        }

        with self.client.post(
            "/vpn/heartbeat",
            json=payload,
            headers=self.get_auth_headers(),
            catch_response=True,
            name="VPN: Heartbeat"
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Heartbeat failed: {response.status_code}")

    @task(1)
    def get_connection_stats(self):
        """
        Получение статистики текущего соединения
        """
        if not self.session_id:
            return

        with self.client.get(
            f"/vpn/stats/{self.session_id}",
            headers=self.get_auth_headers(),
            catch_response=True,
            name="VPN: Get Stats"
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Failed to get stats: {response.status_code}")

    def disconnect(self):
        """
        Отключение от VPN
        """
        if not self.session_id:
            return

        payload = {
            "sessionId": self.session_id
        }

        with self.client.post(
            "/vpn/disconnect",
            json=payload,
            headers=self.get_auth_headers(),
            catch_response=True,
            name="VPN: Disconnect"
        ) as response:
            if response.status_code == 200:
                response.success()
                logger.info(f"User {self.user_id} disconnected")
                self.session_id = None
            else:
                response.failure(f"Disconnect failed: {response.status_code}")


# Event handlers для кастомных метрик
@events.init.add_listener
def on_locust_init(environment, **kwargs):
    """
    Инициализация при старте Locust
    """
    logger.info("Starting VPN Backend Load Test")
    logger.info(f"Target host: {environment.host}")


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """
    Событие при старте теста
    """
    logger.info("Test started!")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """
    Событие при остановке теста
    """
    logger.info("Test stopped!")

    # Вывод статистики
    stats = environment.stats.total
    logger.info(f"Total requests: {stats.num_requests}")
    logger.info(f"Failed requests: {stats.num_failures}")
    logger.info(f"Average response time: {stats.avg_response_time:.2f}ms")
    logger.info(f"RPS: {stats.total_rps:.2f}")


# Дополнительный пользователь для имитации проблемных соединений
class ProblematicVPNUser(VPNUser):
    """
    Пользователь с проблемным поведением:
    - Частые переподключения
    - Таймауты
    - Некорректные запросы
    """

    weight = 1  # 10% от общего числа пользователей

    @task(5)
    def frequent_reconnects(self):
        """
        Частые переподключения
        """
        for _ in range(5):
            self.connect_to_vpn()
            time.sleep(random.randint(5, 15))
            if self.session_id:
                self.disconnect()
            time.sleep(random.randint(2, 5))

    @task(2)
    def send_invalid_requests(self):
        """
        Отправка некорректных запросов
        """
        # Invalid session ID
        payload = {
            "sessionId": "invalid_session_id_12345"
        }

        self.client.post(
            "/vpn/disconnect",
            json=payload,
            headers=self.get_auth_headers(),
            name="VPN: Invalid Disconnect"
        )
