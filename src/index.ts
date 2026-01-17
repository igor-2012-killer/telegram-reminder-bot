import { bot } from './bot';
import { prisma } from './core/prisma';
import { runScheduler } from './services/scheduler';

async function main() {
    // Start Scheduler
    runScheduler(bot);

    console.log("Starting bot...");
    await bot.start({
        onStart: (botInfo) => {
            console.log(`Bot @${botInfo.username} started!`);
        }
    });
}

main().catch((e) => {
    console.error("Error starting bot", e);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
