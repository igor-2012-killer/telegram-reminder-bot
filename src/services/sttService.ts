import OpenAI from "openai";
import { config } from "../core/config";
import axios from "axios";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import ffmpeg from "fluent-ffmpeg";
import logger from "../core/logger";
import { errorForLog } from "../core/redact";

const getSTTClient = () => {
    if (!config.GROQ_API_KEY) return null;

    return new OpenAI({
        apiKey: config.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
    });
};

const WHISPER_MODEL = "whisper-large-v3";

export class STTService {
    /**
     * Transcribes a file from a URL using OpenAI Whisper.
     */
    static async transcribe(fileUrl: string): Promise<string> {
        if (!config.GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY is not configured");
        }

        const tempDir = os.tmpdir();
        const inputPath = path.join(tempDir, `${uuidv4()}.oga`);
        const outputPath = path.join(tempDir, `${uuidv4()}.mp3`);

        try {
            // 1. Download file
            const response = await axios({
                method: "get",
                url: fileUrl,
                responseType: "stream",
            });

            const writer = fs.createWriteStream(inputPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on("finish", resolve);
                writer.on("error", reject);
            });

            // 2. Convert to mp3 using ffmpeg
            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .toFormat("mp3")
                    .on("end", resolve)
                    .on("error", (err) => {
                        logger.error({ error: errorForLog(err) }, "FFmpeg conversion error");
                        reject(err);
                    })
                    .save(outputPath);
            });

            // 3. Transcribe
            const client = getSTTClient();
            if (!client) throw new Error("STT Client failed to initialize");

            const transcription = await client.audio.transcriptions.create({
                file: fs.createReadStream(outputPath),
                model: WHISPER_MODEL,
            });

            return transcription.text;
        } catch (error) {
            logger.error({ error: errorForLog(error) }, "STT error");
            throw error;
        } finally {
            // Cleanup
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        }
    }
}
