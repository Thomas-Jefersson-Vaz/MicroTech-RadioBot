import { Play, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface HistoryItem {
    id: number;
    title: string;
    url: string;
    requested_by: string;
    played_at: number;
}

interface HistoryListProps {
    history: HistoryItem[];
    onRequeue: (url: string) => void;
}

export function HistoryList({ history, onRequeue }: HistoryListProps) {
    if (history.length === 0) {
        return (
            <div className="p-12 text-center text-stone-500 italic space-y-2 bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl">
                <p>No history yet</p>
                <p className="text-xs text-stone-600">Played songs will appear here</p>
            </div>
        );
    }

    return (
        <div className="w-full bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/5 bg-white/5">
                <h3 className="font-semibold text-stone-200 flex items-center gap-2">
                    <span>Recently Played</span>
                </h3>
            </div>
            <div className="divide-y divide-white/5">
                {history.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-white/5 group transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-stone-800 flex items-center justify-center text-stone-500 border border-white/10">
                            <Clock className="w-5 h-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-stone-200 truncate group-hover:text-emerald-400 transition-colors">
                                {item.title}
                            </p>
                            <p className="text-xs text-stone-500">
                                {new Date(item.played_at).toLocaleString()} • {item.requested_by}
                            </p>
                        </div>

                        <button
                            onClick={() => onRequeue(item.url)}
                            className="p-2 rounded-lg text-stone-400 hover:text-emerald-400 hover:bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-all"
                            title="Play Again"
                        >
                            <Play className="w-4 h-4 fill-current" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
