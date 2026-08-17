/**
 * Structured Logger Utility
 * 
 * Provides consistent, filterable log output across the entire backend.
 * Replaces raw console.log/warn/error with structured format:
 *   [HH:MM:SS] [LEVEL] [Component] message
 * 
 * Level controlled via LOG_LEVEL env var (DEBUG | INFO | WARN | ERROR).
 * Color-coded in development for readability.
 */

const LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

// ANSI color codes for terminal output
const COLORS = {
    DEBUG: '\x1b[36m',  // Cyan
    INFO: '\x1b[32m',   // Green
    WARN: '\x1b[33m',   // Yellow
    ERROR: '\x1b[31m',  // Red
    RESET: '\x1b[0m',
    DIM: '\x1b[2m',
    BOLD: '\x1b[1m',
};

const currentLevel = LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ??
    (process.env.NODE_ENV === 'production' ? LEVELS.INFO : LEVELS.DEBUG);

function timestamp() {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { hour12: false });
}

function formatMessage(level, component, message, ...args) {
    const ts = timestamp();
    const prefix = `${COLORS.DIM}${ts}${COLORS.RESET} ${COLORS[level]}${COLORS.BOLD}[${level}]${COLORS.RESET} ${COLORS[level]}[${component}]${COLORS.RESET}`;
    return { prefix, message, args };
}

function createLogger(component) {
    return {
        debug(message, ...args) {
            if (currentLevel > LEVELS.DEBUG) return;
            const { prefix } = formatMessage('DEBUG', component, message, ...args);
            console.debug(`${prefix} ${message}`, ...args);
        },
        info(message, ...args) {
            if (currentLevel > LEVELS.INFO) return;
            const { prefix } = formatMessage('INFO', component, message, ...args);
            console.log(`${prefix} ${message}`, ...args);
        },
        warn(message, ...args) {
            if (currentLevel > LEVELS.WARN) return;
            const { prefix } = formatMessage('WARN', component, message, ...args);
            console.warn(`${prefix} ${message}`, ...args);
        },
        error(message, ...args) {
            if (currentLevel > LEVELS.ERROR) return;
            const { prefix } = formatMessage('ERROR', component, message, ...args);
            console.error(`${prefix} ${message}`, ...args);
        },
    };
}

export default createLogger;
