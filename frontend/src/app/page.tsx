'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { fetchQueue, controlPlayer } from '@/lib/api';
import { Track, PlayerState } from '@/lib/types';
import { useAuth } from '@/lib/auth';

// Mock Guild ID for demo purposes
const DEMO_GUILD_ID = '527032095297372162';

export default function Home() {
  const { user, login, logout } = useAuth();
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // For smooth progress interpolation between polls
  const [displayPosition, setDisplayPosition] = useState(0);
  const lastUpdateRef = useRef<{ position: number; timestamp: number; paused: boolean } | null>(null);
  const animationFrameRef = useRef<number>(0);

  const loadQueue = async () => {
    try {
      const data = await fetchQueue(DEMO_GUILD_ID);
      // API now returns { queue: [], current: ..., playerState: ... }
      if (Array.isArray(data)) {
        setQueue(data);
      } else {
        setQueue(data.queue || []);
        setCurrentTrack(data.current || null);
        setPlayerState(data.playerState || null);

        // Update interpolation anchor point
        if (data.playerState) {
          lastUpdateRef.current = {
            position: data.playerState.position,
            timestamp: Date.now(),
            paused: data.playerState.paused,
          };
        }
      }
    } catch (err) {
      setError('Failed to load queue');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Smooth progress animation via requestAnimationFrame
  const animateProgress = useCallback(() => {
    const ref = lastUpdateRef.current;
    if (ref) {
      if (ref.paused) {
        setDisplayPosition(ref.position);
      } else {
        const elapsed = Date.now() - ref.timestamp;
        setDisplayPosition(ref.position + elapsed);
      }
    }
    animationFrameRef.current = requestAnimationFrame(animateProgress);
  }, []);

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(animateProgress);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [animateProgress]);

  const handleControl = async (action: 'skip' | 'stop' | 'pause' | 'resume') => {
    if (!user) return alert('Please login first');
    try {
      await controlPlayer(DEMO_GUILD_ID, action);
      // Instant refresh
      setTimeout(loadQueue, 500);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const duration = playerState?.duration || currentTrack?.info?.length || 0;
  const progress = duration > 0 ? Math.min(displayPosition / duration, 1) : 0;
  const isPaused = playerState?.paused ?? false;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
            MikroTech Radio
          </h1>
          <p className="text-gray-400">V3 Dashboard Prototype</p>
        </div>
        <div className="flex gap-4">
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-gray-300">Hello, <b>{user.username}</b></span>
              <button onClick={logout} className="px-4 py-2 bg-red-600 rounded hover:bg-red-700 transition font-medium">Logout</button>
            </div>
          ) : (
            <button onClick={login} className="px-4 py-2 bg-indigo-600 rounded hover:bg-indigo-700 transition font-medium">Login with Discord</button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto space-y-8">
        {/* Now Playing Section */}
        <section className="bg-gradient-to-br from-indigo-900 via-purple-900 to-gray-900 rounded-2xl p-8 shadow-2xl border border-indigo-500/30 glow-indigo">
          <div className="flex flex-col md:flex-row items-center gap-8">
            {currentTrack?.info?.artworkUrl ? (
              <img src={currentTrack.info.artworkUrl} alt="Album Art" className="w-48 h-48 rounded-xl shadow-lg object-cover" />
            ) : (
              <div className="w-48 h-48 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-4xl">🎵</span>
              </div>
            )}

            <div className="flex-1 text-center md:text-left space-y-4">
              <div className="space-y-2">
                <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-400">Now Playing</h2>
                <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
                  {currentTrack ? currentTrack.info.title : 'No track playing'}
                </h1>
                <p className="text-xl text-gray-300 font-light">
                  {currentTrack ? currentTrack.info.author : 'Queue up some tunes!'}
                </p>
              </div>

              {currentTrack && (
                <div className="space-y-2">
                  {/* Real progress bar */}
                  <div className="w-full bg-gray-800/50 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-none rounded-full"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                  {/* Time display */}
                  <div className="flex justify-between text-xs text-gray-400 font-mono">
                    <span>{formatDuration(displayPosition)}</span>
                    <span>
                      {isPaused && (
                        <span className="text-yellow-400 mr-2">⏸ Paused</span>
                      )}
                      {formatDuration(duration)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {user && (
          <section className="mb-8 flex flex-wrap gap-4 justify-center">
            <button onClick={() => handleControl('resume')} className="px-6 py-3 bg-green-600 rounded-lg hover:bg-green-700 font-bold shadow-lg transition transform hover:scale-105">Play</button>
            <button onClick={() => handleControl('pause')} className="px-6 py-3 bg-yellow-600 rounded-lg hover:bg-yellow-700 font-bold shadow-lg transition transform hover:scale-105">Pause</button>
            <button onClick={() => handleControl('skip')} className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700 font-bold shadow-lg transition transform hover:scale-105">Skip</button>
            <button onClick={() => handleControl('stop')} className="px-6 py-3 bg-red-600 rounded-lg hover:bg-red-700 font-bold shadow-lg transition transform hover:scale-105">Stop</button>
          </section>
        )}

        <section className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Current Queue</h2>
            <span className="text-sm bg-gray-700 px-3 py-1 rounded-full text-gray-300">
              {queue.length} Tracks
            </span>
          </div>

          {loading && queue.length === 0 ? (
            <div className="text-center py-12 text-gray-500 animate-pulse">
              Loading queue...
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-400 bg-red-900/10 rounded-lg">
              {error}
            </div>
          ) : queue.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">
              Queue is empty. Add songs via Discord using <code>/play</code>
            </div>
          ) : (
            <div className="space-y-4">
              {queue.map((track, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 bg-gray-700/50 p-4 rounded-lg hover:bg-gray-700 transition-colors group"
                >
                  <div className="flex-shrink-0 w-12 h-12 bg-gray-800 rounded flex items-center justify-center text-gray-500 font-mono text-lg">
                    {index + 1}
                  </div>
                  <div className="flex-grow min-w-0">
                    <h3 className="font-medium truncate text-gray-100 group-hover:text-purple-300 transition-colors">
                      {track.info.title}
                    </h3>
                    <p className="text-sm text-gray-400 truncate">
                      {track.info.author} • {formatDuration(track.info.length)}
                    </p>
                  </div>
                  <div className="text-xs text-gray-500">
                    Requested by {track.requester?.username || 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function formatDuration(ms: number) {
  if (!ms || ms <= 0) return '0:00';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
