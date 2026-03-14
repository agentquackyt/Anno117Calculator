
function formatDuration(seconds: number | string = 0): string {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safeSeconds / 60);
    const secs = Math.round(safeSeconds % 60);
    return `${minutes}:${String(secs).padStart(2, '0')}`;
};


export { formatDuration };