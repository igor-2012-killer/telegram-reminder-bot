# Telegram Reminder Bot

An advanced, open-source Telegram bot for setting reminders using natural language. Built with Node.js, TypeScript, and Docker.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)
![Docker](https://img.shields.io/badge/docker-ready-green)

## Features

-   **Natural Language Parsing**: "Remind me to call mom in 10 minutes", "Завтра в 15:00 сходить в магазин".
-   **Timezone Awareness**: Automatically handles user timezones (asks on first start).
-   **Recurrence**: Supports "every day" and "every week" reminders.
-   **Management**: List and delete reminders with an interactive UI.
-   **Modern Stack**: Node.js 22, TypeScript, grammY, Prisma (SQLite).

## Requirements

-   Docker & Docker Compose
-   Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

## Quick Start

1.  **Clone the repository**
    ```bash
    git clone https://github.com/igor-2012-killer/telegram-reminder-bot.git
    cd telegram-reminder-bot
    ```

2.  **Configure environment**
    Copy the example configuration:
    ```bash
    cp .env.example .env
    ```
    Edit `.env` and paste your `BOT_TOKEN`.

3.  **Run with Docker**
    ```bash
    docker-compose up -d
    ```

4.  **Initialize Database**
    ```bash
    docker-compose exec bot npx prisma migrate deploy
    ```

## Development

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Run in development mode:
    ```bash
    npm run dev
    ```

## Stack

-   **Framework**: [grammY](https://grammy.dev/)
-   **Database**: SQLite via [Prisma](https://www.prisma.io/)
-   **Date Parsing**: [chrono-node](https://github.com/wanasit/chrono)
-   **Time Handling**: [Luxon](https://moment.github.io/luxon/)

## License

MIT
