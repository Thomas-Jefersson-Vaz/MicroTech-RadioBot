/** FIFO serialization without importing network clients. */
export class Serial {
    constructor() { this.pending = new Map(); }
    run(key, operation) {
        const result = (this.pending.get(key) || Promise.resolve()).catch(() => {}).then(operation);
        const tail = result.catch(() => {});
        this.pending.set(key, tail);
        void tail.finally(() => { if (this.pending.get(key) === tail) this.pending.delete(key); });
        return result;
    }
}
export async function deadline(operation, milliseconds = 15000) {
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(operation),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Audio resolution timed out')), milliseconds); })
        ]);
    } finally { clearTimeout(timer); }
}
