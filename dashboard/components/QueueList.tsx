import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Song {
    title: string;
    url: string;
    duration: number;
    requestedBy: string;
    thumbnail?: string | null;
}

interface QueueListProps {
    queue: Song[];
    onReorder: (newIndex: number, oldIndex: number) => void;
    onRemove: (index: number) => void;
}

export function QueueList({ queue, onReorder, onRemove }: QueueListProps) {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;

        if (active.id !== over?.id) {
            const oldIndex = parseInt(active.id as string);
            const newIndex = parseInt(over?.id as string);
            onReorder(oldIndex, newIndex);
        }
    }

    // We need generic IDs for sortable. Since queue items might not have unique IDs,
    // we use their index as the ID for the SortableContext, but this is risky if the list changes underneath.
    // Ideally, songs should have UUIDs. For this MVP, we map them to string indices.
    const items = queue.map((_, i) => i.toString());

    return (
        <div className="w-full bg-black/20 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/5 bg-white/5">
                <h3 className="font-semibold text-stone-200 flex items-center gap-2">
                    <span>Up Next</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-stone-400">{queue.length}</span>
                </h3>
            </div>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={items}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="divide-y divide-white/5">
                        {queue.map((song, i) => (
                            <SortableItem key={i} id={i.toString()} song={song} index={i} onRemove={() => onRemove(i)} />
                        ))}
                        {queue.length === 0 && (
                            <div className="p-12 text-center text-stone-500 italic space-y-2">
                                <p>Queue is empty</p>
                                <p className="text-xs text-stone-600">Add some tunes to get the party started!</p>
                            </div>
                        )}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
}

function SortableItem(props: { id: string; song: Song; index: number; onRemove: () => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: props.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : "auto",
        position: "relative" as "relative",
    };

    return (
        <div ref={setNodeRef} style={style} className={cn(
            "flex items-center gap-3 p-3 hover:bg-white/5 group transition-colors",
            isDragging && "opacity-90 bg-stone-900 shadow-2xl ring-1 ring-emerald-500/50 rounded-xl z-10 scale-105"
        )}>
            <button {...attributes} {...listeners} className="touch-none p-2 text-stone-600 hover:text-stone-300 cursor-grab active:cursor-grabbing hover:bg-white/5 rounded-lg transition-colors">
                <GripVertical className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-lg bg-stone-800 flex-shrink-0 overflow-hidden relative border border-white/10 group-hover:border-emerald-500/30 transition-colors">
                {props.song.thumbnail ? (
                    <img src={props.song.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-stone-500 font-mono bg-white/5">
                        {props.index + 1}
                    </div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-200 truncate group-hover:text-emerald-400 transition-colors">{props.song.title}</p>
                <p className="text-xs text-stone-500 truncate">Requested by <span className="text-stone-400">{props.song.requestedBy}</span></p>
            </div>

            <button
                onClick={props.onRemove}
                className="p-2 text-stone-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                title="Remove from queue"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        </div>
    );
}
