'use client'

let selectedVoice: SpeechSynthesisVoice | null = null
let isSpeaking = false
let onEndCallback: (() => void) | null = null

function getBritishVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined') return null
    const voices = window.speechSynthesis.getVoices()
    const preferred = [
        'Google UK English Male',
        'Daniel',
        'Arthur',
        'Google UK English Female',
    ]
    for (const name of preferred) {
        const voice = voices.find(v => v.name === name)
        if (voice) return voice
    }
    return voices.find(v => v.lang === 'en-GB') ?? null
}

function cleanText(text: string): string {
    return text
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/\n+/g, ' ')
        .trim()
}

function splitIntoChunks(text: string): string[] {
    return cleanText(text)
        .split(/(?<=[.!?])\s+/)
        .filter(s => s.trim().length > 0)
}

export function speak(text: string, onEnd?: () => void): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    window.speechSynthesis.cancel()
    isSpeaking = true
    onEndCallback = onEnd ?? null

    const chunks = splitIntoChunks(text)
    if (!selectedVoice) selectedVoice = getBritishVoice()

    let index = 0

    function speakNext() {
        if (index >= chunks.length || !isSpeaking) {
            isSpeaking = false
            onEndCallback?.()
            onEndCallback = null
            return
        }
        const utterance = new SpeechSynthesisUtterance(chunks[index++])
        if (selectedVoice) utterance.voice = selectedVoice
        utterance.rate = 0.92
        utterance.pitch = 0.85
        utterance.volume = 1.0
        utterance.onend = speakNext
        utterance.onerror = () => {
            isSpeaking = false
            onEndCallback?.()
        }
        window.speechSynthesis.speak(utterance)
    }

    speakNext()
}

export function stopSpeaking(): void {
    isSpeaking = false
    onEndCallback = null
    if (typeof window !== 'undefined') {
        window.speechSynthesis?.cancel()
    }
}

export function getIsSpeaking(): boolean {
    return isSpeaking
}

export function loadVoices(): void {
    if (typeof window === 'undefined') return
    window.speechSynthesis.getVoices()
    window.speechSynthesis.onvoiceschanged = () => {
        selectedVoice = getBritishVoice()
    }
}
