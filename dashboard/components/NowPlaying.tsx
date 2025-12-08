import { Music } from "lucide-react";

interface Song {
    title: string;
    url: string;
    duration: number;
    requestedBy: string;
    thumbnail?: string | null;
}

interface NowPlayingProps {
    song: Song | null;
    isPlaying: boolean;
}

export function NowPlaying({ song, isPlaying }: NowPlayingProps) {
    if (!song) {
        return (
            <div className="w-full h-48 rounded-xl bg-stone-900 border border-stone-800 flex flex-col items-center justify-center text-stone-500">
                <Music className="w-12 h-12 mb-4 opacity-50" />
                <p>No music playing</p>
            </div>
        );
    }

    return (
        <div className="w-full p-6 rounded-xl bg-gradient-to-br from-emerald-900/20 to-stone-900 border border-emerald-500/30 relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
                <div className="w-32 h-32 rounded-lg bg-stone-800 flex-shrink-0 flex items-center justify-center shadow-lg shadow-black/50 overflow-hidden relative group">
                    {song.thumbnail ? (
                        <img src={song.thumbnail} alt={song.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    ) : (
                        <Music className="w-12 h-12 text-emerald-400" />
                    )}
                </div>

                <div className="text-center md:text-left space-y-2 flex-1 min-w-0">
                    <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium mb-1">
                        {isPlaying ? <span className="animate-pulse">● Now Playing</span> : <span>⏸ Paused</span>}
                    </div>
                    <h2 className="text-2xl font-bold text-white truncate w-full" title={song.title}>
                        {song.title}
                    </h2>
                    <p className="text-stone-400 text-sm">Requested by <span className="text-stone-300">{song.requestedBy}</span></p>


                </div>
            </div>

            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
        </div>
    );
}
