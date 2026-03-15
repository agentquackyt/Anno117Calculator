
function formatDuration(seconds: number | string = 0): string {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const secs = Math.round(safeSeconds % 60);
    return `${minutes}:${String(secs).padStart(2, '0')}`;
};

const URLTools = {
    /**
     * Converts a object of boolean values into a single query URL parameters.
     * If key is true, the keys are merged into a comma separated list under the "key" parameter.
     * 
     */
    toGetParam(values: Record<string, boolean>): string {
        let list: string[] = [];
        for (const [k, v] of Object.entries(values)) {
            if (v) list.push(k);
        }
        return `${list.join('~')}`;
    },
    fromGetParam<T extends Record<string, boolean>>(key: string, paramString: string, defaults: T): T {
        const params = new URLSearchParams(paramString);
        const value = params.get(key);
        if (!value) return defaults;

        const enabled = new Set(value.split('~').map(s => s.trim()));
        const result = { ...defaults };
        for (const key of Object.keys(result)) {
            result[key as keyof T] = enabled.has(key) as T[keyof T];
        }
        return result;
    } 
};

export { formatDuration, URLTools};