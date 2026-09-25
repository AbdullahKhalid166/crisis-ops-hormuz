import React, { useState, useEffect } from 'react';
import { PlaybackHistory, PlaybackSnapshot } from '../types.ts';
import { Play, Pause } from 'lucide-react';
import { Button } from './ui/button.tsx';

interface PlaybackScrubberProps {
  playbackData: PlaybackHistory | null;
  serverTime: number;
  onRequestPlayback: () => void;
  isLive: boolean;
  setIsLive: (live: boolean) => void;
  playbackSnapshot: PlaybackSnapshot | null;
  setPlaybackSnapshot: (snapshot: PlaybackSnapshot | null) => void;
}

export const PlaybackScrubber: React.FC<PlaybackScrubberProps> = ({
  playbackData,
  serverTime,
  onRequestPlayback,
  isLive,
  setIsLive,
  playbackSnapshot,
  setPlaybackSnapshot,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrubTimestamp, setScrubTimestamp] = useState<number>(serverTime);

  const snapshots = playbackData?.snapshots || [];
  const events = playbackData?.events || [];

  const minTime = snapshots.length > 0 ? snapshots[0].timestamp : serverTime - 3600000;
  const maxTime = serverTime;

  useEffect(() => {
    onRequestPlayback();
    const timer = setInterval(() => {
      onRequestPlayback();
    }, 15000);
    return () => clearInterval(timer);
  }, [onRequestPlayback]);

  useEffect(() => {
    if (isLive) {
      setScrubTimestamp(serverTime);
      setPlaybackSnapshot(null);
    }
  }, [isLive, serverTime, setPlaybackSnapshot]);

  useEffect(() => {
    if (!isPlaying || isLive) return;

    const interval = setInterval(() => {
      setScrubTimestamp((prev) => {
        const next = prev + 1000;
        if (next >= serverTime) {
          setIsLive(true);
          setIsPlaying(false);
          return serverTime;
        }

        updateSnapshotForTime(next);
        return next;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [isPlaying, isLive, serverTime, setIsLive]);

  const updateSnapshotForTime = (time: number) => {
    if (snapshots.length === 0) return;
    let closest = snapshots[0];
    let minDiff = Math.abs(snapshots[0].timestamp - time);

    for (const snap of snapshots) {
      const diff = Math.abs(snap.timestamp - time);
      if (diff < minDiff) {
        minDiff = diff;
        closest = snap;
      }
    }
    setPlaybackSnapshot(closest);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setScrubTimestamp(val);

    if (maxTime - val < 20000) {
      setIsLive(true);
      setPlaybackSnapshot(null);
    } else {
      setIsLive(false);
      updateSnapshotForTime(val);
    }
  };

  const handleGoLive = () => {
    setIsLive(true);
    setIsPlaying(false);
    setScrubTimestamp(serverTime);
    setPlaybackSnapshot(null);
  };

  const formatOffset = (timestamp: number): string => {
    const diffSeconds = Math.max(0, Math.floor((serverTime - timestamp) / 1000));
    if (diffSeconds < 20) return 'Live';
    const mins = Math.floor(diffSeconds / 60);
    const secs = diffSeconds % 60;
    return `-${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  const scrubProgressPct = Math.min(
    100,
    Math.max(0, ((scrubTimestamp - minTime) / (maxTime - minTime || 1)) * 100)
  );

  return (
    <div
      style={{
        left: 'calc(var(--current-rail-width, 300px) + 16px)',
        right: 'calc(var(--right-reserved-width, 0px) + 16px)',
        bottom: 'var(--timeline-bottom-offset, 14px)',
        height: 'var(--timeline-height, 48px)',
      }}
      className="absolute z-30 select-none pointer-events-none flex justify-center transition-all duration-150"
    >
      {/* Floating Pill-Shaped Timeline Bar */}
      <div className="pointer-events-auto bg-[#faf8f5]/95 backdrop-blur-md border border-[#ded9d2] shadow-xl rounded-full px-4 h-full flex items-center space-x-3 text-xs text-[#1f1f1f] max-w-xl w-full">
        {/* Live Pill Toggle using shadcn Button */}
        <Button
          variant={isLive ? 'default' : 'outline'}
          size="sm"
          onClick={handleGoLive}
          className={`h-7 px-3 rounded-full text-xs font-bold uppercase transition-all ${
            isLive
              ? 'bg-[#7a9471] hover:bg-[#688260] text-white shadow-xs'
              : 'bg-[#f2ede6] text-[#6b6660] hover:bg-[#ded9d2] border-none'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full mr-1.5 ${
              isLive ? 'bg-white animate-pulse' : 'bg-[#ded9d2]'
            }`}
          />
          <span>LIVE</span>
        </Button>

        {/* Play/Pause toggle when scrubbing using shadcn Button */}
        {!isLive && (
          <Button
            variant="default"
            size="icon-sm"
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-7 h-7 rounded-full bg-[#1a1a1a] text-white hover:bg-[#2c2c2c] shrink-0"
            title={isPlaying ? 'Pause Replay' : 'Play Replay'}
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
          </Button>
        )}

        {/* Scrub Offset Tag */}
        <div className="text-[11px] font-mono font-semibold text-[#6b6660] tabular-nums shrink-0 min-w-[50px]">
          {formatOffset(scrubTimestamp)}
        </div>

        {/* Timeline Track with Event Ticks and Slider */}
        <div className="flex-1 relative flex items-center h-6">
          {/* Timeline Bar Track */}
          <div className="w-full h-1.5 bg-[#ded9d2] rounded-full relative overflow-visible">
            {/* Filled progress track */}
            <div
              className="h-full bg-[#c65d33] rounded-full"
              style={{ width: `${scrubProgressPct}%` }}
            />

            {/* Tiny Event Ticks */}
            {events.map((evt, idx) => {
              if (evt.timestamp < minTime || evt.timestamp > maxTime) return null;
              const pct = ((evt.timestamp - minTime) / (maxTime - minTime || 1)) * 100;
              const isAlert = evt.type === 'ALERT' || evt.type === 'STATUS_CHANGE';
              return (
                <div
                  key={idx}
                  style={{ left: `${pct}%` }}
                  title={`${evt.description} (${new Date(evt.timestamp).toLocaleTimeString()})`}
                  className={`absolute w-1 h-3 -top-[3px] rounded-full pointer-events-none ${
                    isAlert ? 'bg-red-600 ring-1 ring-white' : 'bg-slate-500'
                  }`}
                />
              );
            })}
          </div>

          {/* Invisible Range Input */}
          <input
            type="range"
            min={minTime}
            max={maxTime}
            value={scrubTimestamp}
            onChange={handleSliderChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />

          {/* Visual Handle Pill */}
          <div
            className="absolute pointer-events-none w-3.5 h-3.5 bg-white border-2 border-amber-500 rounded-full shadow-md -ml-1.5 top-1/2 -translate-y-1/2"
            style={{ left: `${scrubProgressPct}%` }}
          />
        </div>

        {/* Replay Timestamp Display */}
        <div className="text-[11px] font-mono text-slate-500 tabular-nums shrink-0 hidden sm:block">
          {new Date(scrubTimestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};
