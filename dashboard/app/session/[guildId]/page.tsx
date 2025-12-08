"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { NowPlaying } from "@/components/NowPlaying";
import { Controls } from "@/components/Controls";
import { QueueList } from "@/components/QueueList";
import { HistoryList } from "@/components/HistoryList";
import { FilterControls } from "@/components/FilterControls";
import { SearchInput } from "@/components/SearchInput";
import { cn } from "@/lib/utils";


interface Song {
    title: string;
    url: string;
    duration: number;
    requestedBy: string;
    thumbnail?: string | null;
}

interface SessionState {
    currentSong: Song | null;
    queue: Song[];
    isPlaying: boolean;
    volume: number;
    filters: string[];
    position: number; // ms
}

export default function SessionPage({ params }: { params: Promise<{ guildId: string }> }) {
    const resolvedParams = use(params);
    const guildId = resolvedParams.guildId;

    const [state, setState] = useState<SessionState>({
        currentSong: null,
        queue: [],
        isPlaying: false,
        volume: 100,
        filters: [],
        position: 0
    });
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);

    const getAuthHeader = () => {
        if (typeof window !== "undefined") {
            const mode = localStorage.getItem("auth_mode");
            if (mode === 'discord') return localStorage.getItem("discord_token") || "";
            return localStorage.getItem("dashboard_password") || "";
        }
        return "";
    };

    const fetchState = useCallback(async () => {
        try {
            const pwd = getAuthHeader();
            if (!pwd) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch(`/api/queue/${guildId}?_=${Date.now()}`, {
                headers: { "Authorization": pwd }
            });
            // ... auth check ...

            if (res.ok) {
                const data = await res.json();
                setState(prev => ({
                    currentSong: data.currentSong,
                    queue: data.queue || [],
                    isPlaying: data.isPlaying,
                    volume: data.volume,
                    filters: data.filters || [],
                    position: data.position || 0 // Sync from server
                }));
            }
        } catch (error) {
            console.error("Failed to fetch state", error);
        } finally {
            setLoading(false);
        }
    }, [guildId]);

    // Polling
    useEffect(() => {
        fetchState();
        const interval = setInterval(fetchState, 2000);
        return () => clearInterval(interval);
    }, [fetchState]);

    // Client-side smoother for timer
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (state.isPlaying) {
            timer = setInterval(() => {
                setState(prev => ({ ...prev, position: prev.position + 1000 }));
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [state.isPlaying]);

    const handleControl = async (action: string, bodyData?: any) => {
        await fetch(`/api/control/${guildId}/${action}`, {
            method: "POST",
            headers: {
                "Authorization": getAuthHeader(),
                "Content-Type": "application/json"
            },
            body: bodyData ? JSON.stringify({ filter: bodyData }) : undefined
        });
        fetchState();
    };

    const handleSearchSelect = async (url: string) => {
        if (!url) return;

        setIsAdding(true);
        try {
            // Determine requester
            let requester = "Dashboard Admin";
            let userId = undefined;

            const storedUser = localStorage.getItem("discord_user");
            if (storedUser) {
                try {
                    const user = JSON.parse(storedUser);
                    if (user.username) requester = user.username;
                    if (user.id) userId = user.id;
                } catch (e) { /* ignore */ }
            }

            await fetch(`/api/queue/${guildId}/add`, {
                method: "POST",
                headers: {
                    "Authorization": getAuthHeader(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    url: url,
                    requestedBy: requester,
                    requesterId: userId
                })
            });
            fetchState();
        } catch (err) {
            console.error(err);
        } finally {
            setIsAdding(false);
        }
    };

    const handleRemove = async (index: number) => {
        const oldQueue = [...state.queue];
        const newQueue = [...state.queue];
        newQueue.splice(index, 1);
        setState(prev => ({ ...prev, queue: newQueue }));

        try {
            await fetch(`/api/queue/${guildId}/${index}`, {
                method: "DELETE",
                headers: { "Authorization": getAuthHeader() }
            });
        } catch (err) {
            setState(prev => ({ ...prev, queue: oldQueue }));
        }
    };

    const handleReorder = async (oldIndex: number, newIndex: number) => {
        const newQueue = [...state.queue];
        const [moved] = newQueue.splice(oldIndex, 1);
        newQueue.splice(newIndex, 0, moved);
        setState(prev => ({ ...prev, queue: newQueue }));

        try {
            await fetch(`/api/queue/${guildId}/move`, {
                method: "POST",
                headers: {
                    "Authorization": getAuthHeader(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ oldIndex, newIndex })
            });
        } catch (err) {
            // Revert or re-fetch on error
        }
    };

    const [activeTab, setActiveTab] = useState<'queue' | 'history'>('queue');
    const [history, setHistory] = useState<any[]>([]);

    const fetchHistory = useCallback(async () => {
        try {
            const res = await fetch(`/api/history/${guildId}`, {
                headers: { "Authorization": getAuthHeader() }
            });
            if (res.ok) {
                const data = await res.json();
                setHistory(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [guildId]);

    // Fetch history when tab changes to history
    useEffect(() => {
        if (activeTab === 'history') {
            fetchHistory();
        }
    }, [activeTab, fetchHistory]);

    const handleRequeue = async (url: string) => {
        try {
            await fetch(`/api/queue/${guildId}/add`, {
                method: "POST",
                headers: {
                    "Authorization": getAuthHeader(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    url,
                    requestedBy: localStorage.getItem("discord_user")
                        ? JSON.parse(localStorage.getItem("discord_user")!).username
                        : "Dashboard Admin"
                })
            });
            fetchState();
            // Optional: switch back to queue to see it added
            setActiveTab('queue');
        } catch (err) {
            console.error(err);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="animate-spin text-emerald-500 w-8 h-8 rounded-full border-2 border-current border-t-transparent" />
        </div>
    );

    return (
        <main className="min-h-screen text-white p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="flex items-center gap-4 border-b border-white/5 pb-6">
                    <Link href="/" className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white transition-all hover:scale-105 active:scale-95">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                            Session Control
                        </h1>
                        <p className="text-sm text-stone-500">Managing {state.currentSong?.requestedBy ? 'Active Session' : 'Queue'}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column: Player & Controls */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex items-center gap-4">
                            <NowPlaying song={state.currentSong} isPlaying={state.isPlaying} />
                            <div className="ml-auto">
                                <FilterControls
                                    activeFilter={state.filters && state.filters.length > 0 ? state.filters[0] : null}
                                    onApplyFilter={(f) => handleControl('filter', f)}
                                />
                            </div>
                        </div>
                        <Controls
                            isPlaying={state.isPlaying}
                            onPlayPause={() => handleControl(state.isPlaying ? 'pause' : 'resume')}
                            onSkip={() => handleControl('skip')}
                            onStop={() => handleControl('stop')}
                            disabled={!state.currentSong && state.queue.length === 0}
                            position={state.position}
                            duration={state.currentSong?.duration || 0}
                        />


                    </div>

                    {/* Right Column: Tabs (Queue / History) */}
                    <div className="lg:col-span-1 space-y-4">
                        <SearchInput
                            onSelect={handleSearchSelect}
                            isAdding={isAdding}
                        />
                        <div className="flex p-1 bg-white/5 rounded-xl border border-white/5">
                            <button
                                onClick={() => setActiveTab('queue')}
                                className={cn(
                                    "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                                    activeTab === 'queue' ? "bg-stone-800 text-white shadow-lg" : "text-stone-500 hover:text-stone-300"
                                )}
                            >
                                Queue ({state.queue.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={cn(
                                    "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                                    activeTab === 'history' ? "bg-stone-800 text-white shadow-lg" : "text-stone-500 hover:text-stone-300"
                                )}
                            >
                                History
                            </button>
                        </div>

                        {activeTab === 'queue' ? (
                            <QueueList
                                queue={state.queue}
                                onRemove={handleRemove}
                                onReorder={handleReorder}
                            />
                        ) : (
                            <HistoryList
                                history={history}
                                onRequeue={handleRequeue}
                            />
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
