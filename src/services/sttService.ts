import OpenAI from "openai";
import { config } from "../core/config";
import axios from "axios";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import ffmpeg from "fluent-ffmpeg";
import logger from "../core/logger";

const openai = new OpenAI({
    apiKey: config.GROQ_API_KEY || config.OPENAI_API_KEY,
    baseURL: config.GROQ_API_KEY ? "https://api.groq.com/openai/v1" : undefined,
});

const WHISPER_MODEL = config.GROQ_API_KEY ? "whisper-large-v3" : "whisper-1";

export class STTService {
    /**
     * Transcribes a file from a URL using OpenAI Whisper.
     */
    static async transcribe(fileUrl: string): Promise<string> {
        if (!config.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY is not configured");
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
                        logger.error(err, "FFmpeg conversion error");
                        reject(err);
                    })
                    .save(outputPath);
            });

            // 3. Transcribe
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(outputPath),
                model: WHISPER_MODEL,
            });

            return transcription.text;
        } catch (error) {
            logger.error(error, "STT error");
            throw error;
        } finally {
            // Cleanup
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        }
    }
}
