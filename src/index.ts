import { bot } from './bot';
import { prisma } from './core/prisma';
import { runScheduler } from './services/scheduler';
import logger from './core/logger';

async function main() {
    // Start Scheduler
    runScheduler(bot);

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
