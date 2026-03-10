'use client'

import { useState, useCallback, useRef } from 'react'
import { useVoiceActivity } from './useVoiceActivity'
import { speak, stopSpeaking, loadVoices } from './tts'

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking'

interface UseVoiceConversationOptions {
    onTranscription: (text: string) => void
    enabled: boolean
}

export function useVoiceConversation({ onTranscription, enabled }: UseVoiceConversationOptions) {
    const [voiceState, setVoiceState] = useState<VoiceState>('idle')
    const isEnabledRef = useRef(enabled)
    isEnabledRef.current = enabled

    const handleSpeechEnd = useCallback(async (audioBlob: Blob) => {
        if (!isEnabledRef.current) return
        setVoiceState('thinking')

        try {
            const formData = new FormData()
            formData.append('audio', audioBlob, 'recording.webm')

            const response = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) throw new Error('Transcription failed')
            const { text } = await response.json()

            if (text?.trim()) {
                onTranscription(text.trim())
            } else {
                setVoiceState('listening')
            }
        } catch (error) {
            console.error('Transcription error:', error)
            setVoiceState('listening')
        }
    }, [onTranscription])

    const handleSpeechStart = useCallback(() => {
        // Interrupt Solus if speaking
        stopSpeaking()
        setVoiceState('listening')
    }, [])

    const vad = useVoiceActivity({
        onSpeechStart: handleSpeechStart,
        onSpeechEnd: handleSpeechEnd,
    })

    const activate = useCallback(async () => {
        loadVoices()
        await vad.start()
        setVoiceState('listening')
    }, [vad])

    const deactivate = useCallback(() => {
        vad.stop()
        stopSpeaking()
        setVoiceState('idle')
    }, [vad])

    const speakResponse = useCallback((text: string) => {
        if (!isEnabledRef.current) return
        setVoiceState('speaking')
        speak(text, () => setVoiceState('listening'))
    }, [])

    return {
        voiceState,
        activate,
        deactivate,
        speakResponse,
    }
}
