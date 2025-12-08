import { useState } from "react";
import { Sliders, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilterControlsProps {
    activeFilter?: string | null;
    onApplyFilter: (filterValue: string) => void;
}

const FILTER_OPTIONS = [
    { name: 'None', value: 'off', description: 'No effects' },
    { name: 'Bassboost', value: 'bass=g=5:f=100:w=0.6', description: 'Boost low frequencies' },
    { name: 'Nightcore', value: 'asetrate=48000*1.25,aresample=48000', description: 'High pitch & speed' },
    { name: 'Slowed', value: 'asetrate=48000*0.8,aresample=48000,aecho=0.8:0.5:1000:0.2', description: 'Slow & Reverb' },
    { name: '8D Audio', value: 'apulsator=hz=0.125', description: 'Rotating audio effect' },
];

export function FilterControls({ activeFilter, onApplyFilter }: FilterControlsProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "p-3 rounded-xl bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white transition-all shadow-lg hover:shadow-emerald-900/10",
                    isOpen && "bg-white/10 text-emerald-400 ring-1 ring-emerald-500/50"
                )}
                title="Audio Filters (FX)"
            >
                <Sliders className="w-5 h-5" />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setIsOpen(false)} />
                    <div className="absolute left-full top-0 ml-2 w-64 md:w-72 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-4 z-50 space-y-3 origin-top-left animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <h3 className="font-semibold text-stone-200 flex items-center gap-2">
                                <Sliders className="w-4 h-4 text-emerald-500" />
                                Audio Filters
                            </h3>
                            <button onClick={() => setIsOpen(false)} className="text-stone-500 hover:text-white">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-1">
                            {FILTER_OPTIONS.map((opt) => (
                                <button
                                    key={opt.name}
                                    onClick={() => {
                                        onApplyFilter(opt.value);
                                        setIsOpen(false);
                                    }}
                                    className={cn(
                                        "w-full text-left p-3 rounded-lg text-sm transition-all group flex items-start gap-3",
                                        activeFilter === opt.value || (!activeFilter && opt.value === 'off')
                                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                            : "hover:bg-white/5 text-stone-300 border border-transparent"
                                    )}
                                >
                                    <div className={cn(
                                        "w-4 h-4 rounded-full border flex items-center justify-center mt-0.5",
                                        activeFilter === opt.value || (!activeFilter && opt.value === 'off')
                                            ? "border-emerald-500 bg-emerald-500"
                                            : "border-stone-600 group-hover:border-stone-400"
                                    )}>
                                        {(activeFilter === opt.value || (!activeFilter && opt.value === 'off')) && <Check className="w-3 h-3 text-black" />}
                                    </div>
                                    <div>
                                        <p className="font-medium">{opt.name}</p>
                                        <p className="text-xs text-stone-500">{opt.description}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
