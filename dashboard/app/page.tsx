"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Music, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Session {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
}

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchSessions = async () => {
    setLoading(true);
    setError("");
    try {
      // Get auth token based on mode
      const mode = localStorage.getItem("auth_mode");
      const token = mode === 'discord'
        ? localStorage.getItem("discord_token")
        : localStorage.getItem("dashboard_password");

      const res = await fetch(`/api/sessions?_=${Date.now()}`, {
        headers: {
          "Authorization": token || ""
        }
      });
      if (res.status === 401) {
        window.location.href = "/login";
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error("Failed to fetch sessions");
      const data = await res.json();
      setSessions(data);
    } catch (err) {
      setError("Is the bot running? Failed to connect to API.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const pwd = localStorage.getItem("dashboard_password");
    const mode = localStorage.getItem("auth_mode");
    const discordToken = localStorage.getItem("discord_token");

    // Redirect to login if NO password AND NO discord token
    if (!pwd && (!mode || mode !== 'discord' || !discordToken)) {
      window.location.href = "/login";
      return;
    }
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-5xl space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-bold tracking-tighter bg-gradient-to-br from-white via-emerald-100 to-emerald-500 bg-clip-text text-transparent drop-shadow-lg">
            MicroTech Radio
          </h1>
          <p className="text-stone-400 text-lg max-w-2xl mx-auto">
            Select an active server to control playback, manage queues, and apply audio filters in real-time.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            onClick={fetchSessions}
            className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-400 transition-all duration-300"
            title="Refresh Sessions"
          >
            <span className="text-sm font-medium">Refresh List</span>
            <RefreshCw className={cn("w-4 h-4 transition-transform group-hover:rotate-180", loading && "animate-spin")} />
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-center backdrop-blur-md">
            {error}
          </div>
        )}

        {loading && !sessions.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sessions.map((session) => (
              <Link
                key={session.id}
                href={`/session/${session.id}`}
                className="group relative p-6 rounded-2xl bg-black/40 border border-white/5 hover:border-emerald-500/50 hover:bg-black/60 hover:shadow-2xl hover:shadow-emerald-900/20 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
              >
                {/* Glow effect */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-500/20 transition-all duration-500"></div>

                <div className="relative z-10 flex items-center gap-5">
                  {session.icon ? (
                    <img src={session.icon} alt={session.name} className="w-16 h-16 rounded-full border-2 border-white/10 group-hover:border-emerald-500/50 shadow-lg transition-colors" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border-2 border-white/10 group-hover:border-emerald-500/50 transition-colors">
                      <Music className="w-8 h-8 text-stone-600 group-hover:text-emerald-400 transition-colors" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-xl text-stone-100 group-hover:text-emerald-400 truncate transition-colors">
                      {session.name}
                    </h3>
                    <p className="text-sm text-stone-500 group-hover:text-stone-400 transition-colors flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      {session.memberCount} Members
                    </p>
                  </div>
                </div>
              </Link>
            ))}

            {sessions.length === 0 && !loading && (
              <div className="col-span-full py-20 text-center space-y-4 rounded-3xl bg-black/20 border border-white/5 border-dashed">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Music className="w-8 h-8 text-stone-600" />
                </div>
                <h3 className="text-lg font-medium text-stone-300">No active sessions found</h3>
                <p className="text-stone-500 max-w-sm mx-auto">
                  The bot is not currently playing music in any server you are a member of. Join a voice channel and play a song to see it here!
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
