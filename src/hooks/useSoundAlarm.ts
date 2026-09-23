import { useEffect, useRef, useState, useCallback } from 'react';
import { Alert } from '../types.ts';

export function useSoundAlarm(alerts: Alert[]) {
  const [muted, setMuted] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtxRef.current = new AudioContextClass();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  const playBeep = useCallback((priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH') => {
    if (muted) return;
    try {
      initAudio();
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq = priority === 'CRITICAL' ? 920 : priority === 'HIGH' ? 740 : 520;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      if (priority === 'CRITICAL') {
        // Double fast beep
        osc.frequency.setValueAtTime(920, now);
        osc.frequency.setValueAtTime(1100, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      } else {
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Audio playback best effort
    }
  }, [muted, initAudio]);

  const activeAlerts = alerts.filter((a) => a.state === 'active');
  const hasCritical = activeAlerts.some((a) => a.priority === 'CRITICAL');
  const hasHigh = activeAlerts.some((a) => a.priority === 'HIGH');
  const hasActive = activeAlerts.length > 0;

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (hasActive && !muted) {
      const intervalMs = hasCritical ? 1800 : hasHigh ? 2800 : 4000;
      intervalRef.current = setInterval(() => {
        playBeep(hasCritical ? 'CRITICAL' : hasHigh ? 'HIGH' : 'MEDIUM');
      }, intervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasActive, hasCritical, hasHigh, muted, playBeep]);

  const toggleMute = () => {
    initAudio();
    setMuted((prev) => !prev);
  };

  return {
    muted,
    toggleMute,
    playBeep,
    initAudio,
    hasActiveAlerts: hasActive,
    criticalCount: activeAlerts.filter((a) => a.priority === 'CRITICAL').length,
  };
}
