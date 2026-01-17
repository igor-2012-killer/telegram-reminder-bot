# Telegram Reminder Bot

[English version](README.en.md)

Продвинутый Open Source Telegram-бот для создания напоминаний на естественном языке. Создан с использованием Node.js, TypeScript и Docker.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)
![Docker](https://img.shields.io/badge/docker-ready-green)

## Основные возможности

-   **Понимание естественной речи**: Поддерживает фразы вроде "напомни позвонить маме через 10 минут", "завтра в 15:00 сходить в магазин", "каждую субботу уборка".
-   **AI Расшифровка (STT)**: Отправьте голосовое сообщение или "кружок", и бот автоматически расшифрует его для создания напоминания (через [Groq AI](https://groq.com/)).
-   **Продвинутые повторы**: Поддержка сложных правил (каждые 3 дня, по понедельникам и т.д.) через `rrule`.
-   **Поддержка групп**: Бот работает в группах, напоминая всем участникам о важных событиях.
-   **Умные часовые пояса**: Бот автоматически запрашивает часовой пояс при первом запуске и нормализует ввод (понимает "Moscow", "Msk", "London" и т.д.).
-   **Современный стек**: Node.js 22 (Debian Slim), TypeScript, grammY, Prisma (SQLite), Groq Whisper.

## Требования

-   Docker и Docker Compose
-   Токен Telegram бота (от [@BotFather](https://t.me/BotFather))

## Быстрый старт

1.  **Клонируйте репозиторий**
    ```bash
    git clone https://github.com/igor-2012-killer/telegram-reminder-bot.git
    cd telegram-reminder-bot
    ```

2.  **Настройте окружение**
    Скопируйте пример файла конфигурации:
    ```bash
    cp .env.example .env
    ```
    Отредактируйте `.env` и вставьте ваш `BOT_TOKEN`.

3.  **Запуск через Docker**
    ```bash
    docker compose up -d
    ```

4.  **Развертывание базы данных**
    При первом запуске выполните миграцию:
    ```bash
    docker compose exec bot npx prisma migrate deploy
    ```

## Разработка

1.  Установите зависимости:
    ```bash
    npm install
    ```
2.  Запустите в режиме разработки:
    ```bash
    npm run dev
    ```

## Технологии

-   **Framework**: [grammY](https://grammy.dev/)
-   **Database**: SQLite via [Prisma](https://www.prisma.io/)
-   **Date Parsing**: [chrono-node](https://github.com/wanasit/chrono) (с поддержкой RU локали)
-   **Time Handling**: [Luxon](https://moment.github.io/luxon/)

## Лицензия

MIT
