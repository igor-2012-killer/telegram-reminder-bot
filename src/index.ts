import { bot, registerBotCommands } from "./bot";
import { prisma } from "./core/prisma";
import { errorForLog } from "./core/redact";
import { runScheduler } from "./services/scheduler";
import logger from "./core/logger";

async function main() {
    runScheduler(bot);
    await registerBotCommands();

    logger.info("Starting bot...");
    await bot.start({
        onStart: (botInfo) => {
            logger.info(`Bot @${botInfo.username} started!`);
        },
    });
}

main()
    .catch((e) => {
        logger.error({ error: errorForLog(e) }, "Error starting bot");
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
