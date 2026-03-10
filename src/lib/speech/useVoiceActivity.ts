'use client'

import { useRef, useCallback, useEffect } from 'react'

interface VADOptions {
    onSpeechStart: () => void
    onSpeechEnd: (audioBlob: Blob) => void
    silenceThreshold?: number   // volume below this = silence (0-255, default 15)
    silenceDuration?: number    // ms of silence before speech end fires (default 1200)
    minSpeechDuration?: number  // ms of speech required to count (default 300)
}

export function useVoiceActivity(options: VADOptions) {
    const {
        onSpeechStart,
        onSpeechEnd,
        silenceThreshold = 15,
        silenceDuration = 1200,
        minSpeechDuration = 300,
    } = options

    const streamRef = useRef<MediaStream | null>(null)
    const audioContextRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const recorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const animFrameRef = useRef<number>(0)
    const isSpeakingRef = useRef(false)
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
    const speechStartTimeRef = useRef<number>(0)
    const isActiveRef = useRef(false)

    const stopRecording = useCallback(() => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
            recorderRef.current.stop()
        }
    }, [])

    const startRecording = useCallback(() => {
        if (!streamRef.current) return
        chunksRef.current = []
        const recorder = new MediaRecorder(streamRef.current, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
        })
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        recorder.onstop = () => {
            const duration = Date.now() - speechStartTimeRef.current
            if (duration >= minSpeechDuration && chunksRef.current.length > 0) {
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
                onSpeechEnd(blob)
            }
            chunksRef.current = []
        }
        recorder.start()
        recorderRef.current = recorder
    }, [minSpeechDuration, onSpeechEnd])

    const monitor = useCallback(() => {
        if (!analyserRef.current || !isActiveRef.current) return

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)
        const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

        if (volume > silenceThreshold) {
            // Speech detected
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current)
                silenceTimerRef.current = null
            }
            if (!isSpeakingRef.current) {
                isSpeakingRef.current = true
                speechStartTimeRef.current = Date.now()
                onSpeechStart()
                startRecording()
            }
        } else {
            // Silence detected
            if (isSpeakingRef.current && !silenceTimerRef.current) {
                silenceTimerRef.current = setTimeout(() => {
                    isSpeakingRef.current = false
                    silenceTimerRef.current = null
                    stopRecording()
                }, silenceDuration)
            }
        }

        animFrameRef.current = requestAnimationFrame(monitor)
    }, [silenceThreshold, silenceDuration, onSpeechStart, startRecording, stopRecording])

    const start = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream

            const audioContext = new AudioContext()
            const source = audioContext.createMediaStreamSource(stream)
            const analyser = audioContext.createAnalyser()
            analyser.fftSize = 256
            source.connect(analyser)

            audioContextRef.current = audioContext
            analyserRef.current = analyser
            isActiveRef.current = true

            animFrameRef.current = requestAnimationFrame(monitor)
        } catch (error) {
            console.error('VAD start error:', error)
            throw error
        }
    }, [monitor])

    const stop = useCallback(() => {
        isActiveRef.current = false
        cancelAnimationFrame(animFrameRef.current)

        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
            silenceTimerRef.current = null
        }

        if (recorderRef.current?.state !== 'inactive') {
            recorderRef.current?.stop()
        }

        streamRef.current?.getTracks().forEach(t => t.stop())
        audioContextRef.current?.close()

        streamRef.current = null
        audioContextRef.current = null
        analyserRef.current = null
        recorderRef.current = null
        isSpeakingRef.current = false
    }, [])

    useEffect(() => {
        return () => stop()
    }, [stop])

    return { start, stop }
}
