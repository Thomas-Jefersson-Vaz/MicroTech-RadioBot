import { useState, useEffect, useRef } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
    title: string;
    url: string;
    channel: string;
    thumbnail: string;
}

interface SearchInputProps {
    onSelect: (url: string) => void;
    placeholder?: string;
    disabled?: boolean;
    isAdding?: boolean;
}

export function SearchInput({ onSelect, placeholder, disabled, isAdding }: SearchInputProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.length < 3) {
                setResults([]);
                return;
            }
            if (!isOpen) return; // Only search if we are focusing/typing

            setLoading(true);
            try {
                // Use relative path for proxy
                const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
                    headers: {
                        "Authorization": typeof window !== 'undefined' ? (localStorage.getItem("discord_token") || localStorage.getItem("dashboard_password") || "") : ""
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    setResults(data);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [query, isOpen]);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSelect(query);
        setQuery("");
        setIsOpen(false);
    };

    return (
        <div ref={wrapperRef} className="relative group w-full">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl opacity-20 group-hover:opacity-40 transition duration-500 blur"></div>
            <form onSubmit={handleSubmit} className="relative flex gap-2 p-2 bg-stone-900 rounded-xl">
                <div className="flex-1 flex items-center bg-transparent px-4">
                    <Search className="w-4 h-4 text-stone-500 mr-2" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                        placeholder={placeholder || "Search or Paste URL..."}
                        className="flex-1 bg-transparent border-none text-white focus:outline-none placeholder:text-stone-600 font-medium py-2"
                    />
                </div>
                <button
                    type="submit"
                    disabled={disabled || !query}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium transition-all shadow-lg shadow-emerald-900/20 active:translate-y-0.5 min-w-[100px] flex justify-center"
                >
                    {isAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <div className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add</div>}
                </button>
            </form>

            {/* Suggestions Dropdown */}
            {isOpen && query.length >= 3 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-stone-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                    {loading ? (
                        <div className="p-4 text-center text-stone-500 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Searching YouTube...
                        </div>
                    ) : results.length > 0 ? (
                        <div className="divide-y divide-white/5">
                            {results.map((res) => (
                                <button
                                    key={res.url}
                                    onClick={() => {
                                        onSelect(res.url);
                                        setQuery("");
                                        setIsOpen(false);
                                    }}
                                    className="w-full text-left p-3 hover:bg-white/5 transition-colors flex items-center gap-3 group/item"
                                >
                                    <img src={res.thumbnail} alt="" className="w-10 h-8 object-cover rounded bg-stone-800" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-stone-200 truncate group-hover/item:text-emerald-400 transition-colors">{res.title}</p>
                                        <p className="text-xs text-stone-500 truncate">{res.channel}</p>
                                    </div>
                                    <Plus className="w-4 h-4 text-stone-500 opacity-0 group-hover/item:opacity-100" />
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="p-4 text-center text-stone-500 text-sm">
                            No results found. Press enter to add as raw URL.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
