"use client";

import { useState, useEffect } from "react";
import { LogOut, User as UserIcon, Shield, Menu, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Navbar() {
    const [user, setUser] = useState<any>(null);
    const [mode, setMode] = useState<string>("");
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const router = useRouter();

    useEffect(() => {
        const storedMode = localStorage.getItem("auth_mode");
        const storedUser = localStorage.getItem("discord_user");

        setMode(storedMode || "");
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (e) {
                console.error("Failed to parse user", e);
            }
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem("dashboard_password");
        localStorage.removeItem("discord_token");
        localStorage.removeItem("discord_user");
        localStorage.removeItem("auth_mode");
        router.push("/login");
    };

    if (!mode) return null;

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/20 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between">

                    {/* Brand */}
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-all duration-300">
                            <Shield className="w-5 h-5 fill-white/20" />
                        </div>
                        <span className="text-lg font-bold bg-gradient-to-r from-white to-stone-400 bg-clip-text text-transparent">
                            MicroTech Radio
                        </span>
                    </Link>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex items-center gap-4">
                        <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                            {user && user.avatar ? (
                                <img
                                    src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                                    alt="Avatar"
                                    className="w-6 h-6 rounded-full ring-2 ring-emerald-500/20"
                                />
                            ) : (
                                <div className="w-6 h-6 bg-stone-800 rounded-full flex items-center justify-center text-stone-500">
                                    <UserIcon className="w-3 h-3" />
                                </div>
                            )}
                            <span className="text-sm font-medium text-stone-300">
                                {user ? user.username : (mode === 'admin' ? 'Administrator' : 'Guest')}
                            </span>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-white/5 transition-all"
                            title="Logout"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        className="md:hidden p-2 text-stone-400 hover:text-white"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >
                        {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            {isMenuOpen && (
                <div className="md:hidden border-t border-white/5 bg-black/90 backdrop-blur-xl absolute w-full left-0">
                    <div className="p-4 space-y-4">
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
                            {user && user.avatar ? (
                                <img
                                    src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                                    alt="Avatar"
                                    className="w-8 h-8 rounded-full"
                                />
                            ) : (
                                <div className="w-8 h-8 bg-stone-800 rounded-full flex items-center justify-center text-stone-500">
                                    <UserIcon className="w-4 h-4" />
                                </div>
                            )}
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-white">
                                    {user ? user.username : (mode === 'admin' ? 'Administrator' : 'Guest')}
                                </span>
                                <span className="text-xs text-stone-500 capitalize">{mode} Access</span>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>
            )}
        </nav>
    );
}
