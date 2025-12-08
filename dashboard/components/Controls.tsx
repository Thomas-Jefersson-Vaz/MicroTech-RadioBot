import { Play, Pause, SkipForward, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface ControlsProps {
    isPlaying: boolean;
    onPlayPause: () => void;
    onSkip: () => void;
    onStop: () => void;
    disabled?: boolean;
    position?: number; // ms
    duration?: number; // seconds
}

export function Controls({ isPlaying, onPlayPause, onSkip, onStop, disabled, position = 0, duration = 0 }: ControlsProps) {

    const [currentPosition, setCurrentPosition] = useState(position);

    // Sync local position with prop when it updates (from API)
    useEffect(() => {
        setCurrentPosition(position);
    }, [position]);

    // Local timer to increment second-by-second
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isPlaying) {
            interval = setInterval(() => {
                setCurrentPosition((prev: number) => {
                    // Don't go past duration
                    const next = prev + 1000;
                    if (duration && next > duration * 1000) return duration * 1000;
                    return next;
                });
            }, 1000);
        }

        return () => clearInterval(interval);
    }, [isPlaying, duration]);

    // Calculate progress percentage for bar
    const progress = duration && duration > 0
        ? Math.min((currentPosition / (duration * 1000)) * 100, 100)
        : 0;

    const formatTime = (ms: number) => {
        if (!ms || ms < 0) return "0:00";
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const formatDuration = (secs: number) => {
        if (!secs) return "0:00";
        const minutes = Math.floor(secs / 60);
        const seconds = secs % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex flex-col items-center gap-6 py-8 w-full">
            {/* Progress Bar */}
            <div className="w-full flex items-center gap-4 px-2 group">
                <span className="text-xs font-mono text-emerald-400 w-10 text-right opacity-80 group-hover:opacity-100 transition-opacity">
                    {formatTime(currentPosition)}
                </span>

                <div className="flex-1 h-2 bg-stone-900/50 rounded-full overflow-hidden relative ring-1 ring-white/5 group-hover:ring-white/10 transition-all cursor-pointer">
                    {/* Background track glow */}
                    <div className="absolute inset-0 bg-emerald-500/5" />

                    <div
                        className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all duration-1000 ease-linear relative"
                        style={{ width: `${progress}%` }}
                    >
                        {/* Glow at the tip */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-emerald-400 rounded-full blur-md opacity-50"></div>
                        <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/50"></div>
                    </div>
                </div>

                <span className="text-xs font-mono text-stone-500 w-10 opacity-80 group-hover:opacity-100 transition-opacity">
                    {formatDuration(duration)}
                </span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-8">
                <button
                    onClick={onStop}
                    disabled={disabled}
                    className="p-4 rounded-2xl hover:bg-white/5 text-stone-400 hover:text-red-400 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Stop & Clear"
                >
                    <Square className="w-5 h-5 fill-current" />
                </button>

                <button
                    onClick={onPlayPause}
                    disabled={disabled}
                    className={cn(
                        "p-6 rounded-[2rem] bg-white text-black transition-all shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 relative group overflow-hidden",
                        isPlaying && "bg-emerald-400 ring-4 ring-emerald-500/20"
                    )}
                >
                    {/* Button Glow */}
                    <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500", isPlaying ? "bg-white/20" : "bg-black/5")}></div>

                    {isPlaying ? (
                        <Pause className="w-8 h-8 fill-current relative z-10" />
                    ) : (
                        <Play className="w-8 h-8 fill-current translate-x-1 relative z-10" />
                    )}
                </button>

                <button
                    onClick={onSkip}
                    disabled={disabled}
                    className="p-4 rounded-2xl hover:bg-white/5 text-stone-400 hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Skip Track"
                >
                    <SkipForward className="w-5 h-5 fill-current" />
                </button>
            </div>
        </div>
    );
}
