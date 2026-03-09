/**
 * src/lib/speech/vad.ts
 *
 * Voice Activity Detection (VAD) manager.
 * Uses @ricky0123/vad-web for in-browser silence detection.
 */

'use client';

import { MicVAD } from "@ricky0123/vad-web";

let vad: MicVAD | null = null;

export async function startVAD(callbacks: {
    onSpeechStart: () => void;
    onSpeechEnd: (audio: Float32Array) => void;
}): Promise<void> {
    try {
        vad = await MicVAD.new({
            onSpeechStart: callbacks.onSpeechStart,
            onSpeechEnd: callbacks.onSpeechEnd,
            positiveSpeechThreshold: 0.8,
            negativeSpeechThreshold: 0.6,
            minSpeechMs: 100,
        });
        await vad.start();
    } catch (error) {
        console.error("VAD startup failed:", error);
    }
}

export function stopVAD(): void {
    if (vad) {
        vad.pause();
        vad.destroy();
        vad = null;
    }
}

/**
 * Converts Float32Array (VAD output) to a WAV Blob for Groq Whisper.
 * Sample rate is usually 16000 for Silero VAD based on documentation.
 */
export function float32ToWav(samples: Float32Array, sampleRate = 16000): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    writeString(36, "data");
    view.setUint32(40, samples.length * 2, true);

    // Audio data (PCM 16-bit)
    const int16 = new Int16Array(buffer, 44);
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    return new Blob([buffer], { type: "audio/wav" });
}
