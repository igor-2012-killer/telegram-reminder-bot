# Telegram Reminder Bot

[Русская версия](README.md)

An advanced, open-source Telegram bot for setting reminders using natural language. Built with Node.js, TypeScript, and Docker.

🚀 **Try it out:** [@remind_hint_bot](https://t.me/remind_hint_bot)


![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/language-TypeScript-blue)
![Docker](https://img.shields.io/badge/docker-ready-green)

## Features

-   **Natural Language Parsing**: Supports inputs like "Remind me to call mom in 10 minutes", "Tomorrow at 3 PM go grocery shopping", "Every Monday cleaning".
-   **AI Transcription (STT)**: Send a voice message or video note, and the bot will automatically transcribe it to create a reminder (powered by [Groq AI](https://groq.com/)).
-   **Advanced Recurrence**: Support for complex rules (every 3 days, on Mondays, etc.) via `rrule`.
-   **Group Support**: The bot works in groups, reminding all members about important tasks.
-   **Timezone Awareness**: Handles user timezones automatically (asks on first start) and supports city aliases (e.g., "Moscow", "NY").
-   **Modern Stack**: Node.js 22 (Debian Slim), TypeScript, grammY, Prisma (SQLite), Groq Whisper.

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
    docker compose up -d
    ```

4.  **Initialize Database**
    Run migrations on first start:
    ```bash
    docker compose exec bot npm run migrate
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
-   **Date Parsing**: [chrono-node](https://github.com/wanasit/chrono) (RU/EN support)
-   **Time Handling**: [Luxon](https://moment.github.io/luxon/)

## License

MIT
