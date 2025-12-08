"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Lock, Circle } from "lucide-react";

export default function LoginPage() {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const processedRef = useRef(false);

    useEffect(() => {
        // Check for Discord Callback
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code && !processedRef.current) {
            processedRef.current = true;
            handleDiscordCallback(code);
        }
    }, []);

    const handleDiscordCallback = async (code: string) => {
        setIsLoading(true);
        try {
            // Use current URL as redirect URI (minus query params)
            const redirectUri = window.location.origin + '/login';

            const res = await fetch('/api/auth/discord/callback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, redirectUri })
            });

            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('discord_token', data.token);
                localStorage.setItem('discord_user', JSON.stringify(data.user));
                localStorage.setItem('auth_mode', 'discord');
                router.push('/');
            } else {
                setError('Discord Login Failed');
                setIsLoading(false);
            }
        } catch (err) {
            setError('Connection error');
            setIsLoading(false);
        }
    };

    const handleDiscordLogin = async () => {
        try {
            const redirectUri = window.location.origin + '/login';
            const res = await fetch('/api/auth/discord/url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ redirectUri })
            });
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (err) {
            setError("Failed to start Discord Login");
        }
    };

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (password) {
            localStorage.setItem("dashboard_password", password);
            localStorage.setItem("auth_mode", "admin");
            router.push("/");
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-stone-950 flex items-center justify-center">
                <div className="text-stone-400 animate-pulse">Logging in with Discord...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-stone-900 border border-stone-800 rounded-2xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                        <Lock className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-stone-200">Access Dashboard</h1>
                    <p className="text-stone-500 mt-2">Choose how you want to sign in</p>
                </div>

                <div className="space-y-4"> {/* Stack Buttons */}

                    {/* Discord Login */}
                    <button
                        onClick={handleDiscordLogin}
                        className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white p-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 group"
                    >
                        <div className="p-1 bg-white/10 rounded-lg group-hover:bg-white/20 transition-colors">
                            <Circle className="w-5 h-5" />
                        </div>
                        Login with Discord
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-stone-800" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-stone-900 px-2 text-stone-500">Or Admin Access</span>
                        </div>
                    </div>

                    {/* Admin Login */}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <input
                                type="password"
                                placeholder="Enter Admin Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-200 placeholder:text-stone-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            />
                        </div>

                        {error && (
                            <div className="text-red-400 text-sm text-center bg-red-400/10 p-2 rounded-lg border border-red-400/20">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="w-full bg-stone-800 hover:bg-stone-700 text-stone-300 p-3 rounded-xl font-medium transition-colors"
                        >
                            Login as Admin
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
