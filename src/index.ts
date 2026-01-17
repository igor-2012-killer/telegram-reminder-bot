import { bot } from './bot';
import { prisma } from './core/prisma';
import { runScheduler } from './services/scheduler';
import logger from './core/logger';
import { limit } from "@grammyjs/ratelimiter";

async function main() {
    // Start Scheduler
    runScheduler(bot);

    // Rate limiting
    bot.use(limit());

    logger.info("Starting bot...");
    await bot.start({
        onStart: (botInfo) => {
            logger.info(`Bot @${botInfo.username} started!`);
        }
    });
}

main().catch((e) => {
    logger.error(e, "Error starting bot");
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
