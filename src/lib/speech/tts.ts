/**
 * src/lib/speech/tts.ts
 *
 * Text-to-speech using browser speechSynthesis.
 * Configured for a British male "Jarvis-like" voice.
 * Handles the Chrome 15-second cutoff by chunking sentences.
 */

'use client';

let selectedVoice: SpeechSynthesisVoice | null = null;
let isSpeakingGlobal = false;

function getBritishVoice(): SpeechSynthesisVoice | null {
    if (typeof window === "undefined") return null;

    const voices = window.speechSynthesis.getVoices();

    // Priority order for Jarvis vibes
    const preferredNames = [
        "Google UK English Male",
        "Daniel",    // Classic macOS British Male
        "Arthur",    // Newer macOS British Male
        "Oliver",
        "Google UK English Female", // fallback
    ];

    for (const name of preferredNames) {
        const voice = voices.find(v => v.name === name);
        if (voice) return voice;
    }

    // Last resort: any GB voice
    return voices.find(v => v.lang === "en-GB") ?? null;
}

/**
 * Strips markdown and splits into sentences for chunked playback
 */
function splitIntoChunks(text: string): string[] {
    return text
        .replace(/#{1,6}\s/g, "")                    // Header markdown
        .replace(/\*\*(.*?)\*\*/g, "$1")            // Bold
        .replace(/\*(.*?)\*/g, "$1")                // Italic
        .replace(/`(.*?)`/g, "$1")                  // Inline code
        .replace(/```[\s\S]*?```/g, "Code omitted") // Code blocks
        .replace(/\[(.*?)\]\(.*?\)/g, "$1")         // Links
        .split(/(?<=[.!?])\s+/)                     // Split by punctuation
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

export function speak(text: string, onEnd?: () => void): void {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    // Stop anything currently speaking
    window.speechSynthesis.cancel();
    isSpeakingGlobal = true;

    const chunks = splitIntoChunks(text);
    if (chunks.length === 0) {
        isSpeakingGlobal = false;
        onEnd?.();
        return;
    }

    if (!selectedVoice) selectedVoice = getBritishVoice();

    let index = 0;

    function speakNext() {
        if (index >= chunks.length || !isSpeakingGlobal) {
            isSpeakingGlobal = false;
            onEnd?.();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index++]);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        // JARVIS calibration
        utterance.rate = 0.95;
        utterance.pitch = 0.9;
        utterance.volume = 1.0;

        utterance.onend = speakNext;
        utterance.onerror = (e) => {
            console.error("SpeechSynthesis error:", e);
            speakNext();
        };

        window.speechSynthesis.speak(utterance);
    }

    speakNext();
}

export function stopSpeaking(): void {
    isSpeakingGlobal = false;
    if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

export function getIsSpeaking(): boolean {
    return isSpeakingGlobal;
}

/**
 * Call this on app mount to pre-fill voices
 */
export function loadVoices(): void {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    // Fetch initial list
    window.speechSynthesis.getVoices();

    // Voices load async on some browsers
    window.speechSynthesis.onvoiceschanged = () => {
        selectedVoice = getBritishVoice();
    };
}
