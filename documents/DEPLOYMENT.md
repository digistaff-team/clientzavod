# Развёртывание Docker-Claw на VPS

## Требования к серверу

- **OS:** Ubuntu 20.04+ / Debian 11+
- **RAM:** от 2 GB
- **CPU:** от 2 ядер
- **Диск:** от 20 GB
- **Docker** должен быть установлен

---

## Шаг 1: Подготовка сервера

### 1.1 Подключение к серверу
```bash
ssh root@your-vps-ip
```

### 1.2 Обновление системы
```bash
apt update && apt upgrade -y
```

### 1.3 Установка Docker (если не установлен)
```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
```

### 1.4 Установка Docker Compose
```bash
apt install -y docker-compose
```

---

## Шаг 2: Настройка PostgreSQL

### Вариант A: PostgreSQL в Docker (рекомендуется)

Создайте файл `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: claw-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_secure_password
      POSTGRES_DB: claw
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

volumes:
  postgres_data:
```

Запуск:
```bash
docker-compose up -d
```

### Вариант B: Установка PostgreSQL напрямую

```bash
apt install -y postgresql postgresql-contrib

# Настройка пароля
sudo -u postgres psql
ALTER USER postgres PASSWORD 'your_secure_password';
\q
```

---

## Шаг 3: Настройка файлов приложения

### 3.1 Создание директорий
```bash
mkdir -p /opt/claw/{data,backups,snapshots}
```

### 3.2 Клонирование репозитория
```bash
cd /opt/claw
git clone https://github.com/your-repo/Docker-Claw.git .
```

### 3.3 Создание .env файла
```bash
cp .env.example .env
nano .env
```

Заполните .env:
```env
# Сервер
PORT=3015
NODE_ENV=production

# App URL (HTTPS обязательно для Telegram!)
APP_URL=https://your-domain.com

# Telegram Bot
BOT_TOKEN=your_telegram_bot_token

# API URL
API_URL=https://your-domain.com

# PostgreSQL
PG_HOST=172.17.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your_secure_password

# Docker
DOCKER_IMAGE=sandbox-python:latest
CONTAINER_MEMORY=1g
CONTAINER_CPUS=2.0

# Хранилище
DATA_ROOT=/opt/claw/data
BACKUP_ROOT=/opt/claw/backups
SNAPSHOT_ROOT=/opt/claw/snapshots
```

---

## Шаг 4: Настройка Nginx (Reverse Proxy)

### 4.1 Установка Nginx
```bash
apt install -y nginx certbot python3-certbot-nginx
```

### 4.2 Настройка SSL (Let's Encrypt)
```bash
# Получение SSL сертификата
certbot --nginx -d your-domain.com

# Автообновление сертификата
certbot renew --dry-run
```

### 4.3 Конфигурация Nginx
Создайте `/etc/nginx/sites-available/claw`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3015;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Активация:
```bash
ln -s /etc/nginx/sites-available/claw /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## Шаг 5: Запуск приложения

### 5.1 Установка зависимостей
```bash
cd /opt/claw
npm install
```

### 5.2 Запуск через PM2 (рекомендуется)
```bash
npm install -g pm2
pm2 start server.js --name claw
pm2 startup
pm2 save
```

### 5.3 Или запуск вручную (для отладки)
```bash
node server.js
```

---

## Шаг 6: Настройка Firewall

```bash
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw enable
```

---

## Шаг 7: Проверка работы

```bash
# Проверка статуса
pm2 status

# Проверка логов
pm2 logs claw

# Проверка портов
netstat -tlnp | grep 3015
```

---

## Обновление приложения

```bash
cd /opt/claw
git pull
npm install
pm2 restart claw
```

---

## Структура директорий

```
/opt/claw/
├── data/           # Данные пользователей
├── backups/        # Резервные копии
├── snapshots/      # Снапшоты файлов
├── node_modules/   # Зависимости
├── .env            # Конфигурация
└── server.js       # Главный файл
```

---

## Устранение проблем

### PostgreSQL не подключается
```bash
# Проверка статуса
docker ps
docker logs claw-postgres

# Проверка подключения
psql -h localhost -U postgres -d claw
```

### Telegram бот не работает
```bash
# Проверка токена
curl -s https://api.telegram.org/bot<TOKEN>/getMe

# Проверка логов
pm2 logs claw
```

### SSL ошибки
```bash
# Проверка сертификата
certbot certificates

# Обновление
certbot renew
```
