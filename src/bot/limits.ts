/** Voice and video notes longer than this are not downloaded or transcribed. */
export const MAX_MEDIA_DURATION_SEC = 60;

/** Extra ceiling so a short-but-huge upload cannot fill the disk before ffmpeg runs. */
export const MAX_MEDIA_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Library default is 1 update per second and a silent drop, which would swallow
 * a second button tap in the edit/timezone dialogs. 5 updates / 10s still
 * bounds voice transcription without blocking normal use.
 */
export const UPDATE_RATE_LIMIT = 5;
export const UPDATE_RATE_WINDOW_MS = 10_000;
export const RATE_LIMIT_MESSAGE = "Слишком много сообщений. Подождите немного и попробуйте снова.";

export function mediaRejectionReason(media: {
    duration?: number;
    file_size?: number;
}): string | null {
    if (media.duration == null || media.duration <= 0 || media.duration > MAX_MEDIA_DURATION_SEC) {
        return `Могу расшифровать только сообщения до ${MAX_MEDIA_DURATION_SEC} секунд.`;
    }
    if (media.file_size != null && media.file_size > MAX_MEDIA_FILE_BYTES) {
        return "Файл слишком большой. Отправьте более короткое сообщение.";
    }
    return null;
}
