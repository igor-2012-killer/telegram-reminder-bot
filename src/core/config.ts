import dotenv from 'dotenv';
dotenv.config();

export const config = {
    BOT_TOKEN: process.env.BOT_TOKEN || '',
    DATABASE_URL: process.env.DATABASE_URL || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
};
