/**
 * Utility for reading and writing URL search parameters without navigation.
 */
export class URLTools {
    static get(key: string): string | null {
        return new URL(window.location.href).searchParams.get(key);
    }

    static set(key: string, value: string): void {
        const url = new URL(window.location.href);
        url.searchParams.set(key, value);
        window.history.replaceState(null, '', url.toString());
    }

    static delete(key: string): void {
        const url = new URL(window.location.href);
        url.searchParams.delete(key);
        window.history.replaceState(null, '', url.toString());
    }

    static getBoolean(key: string, defaultValue = false): boolean {
        const val = URLTools.get(key);
        if (val === null) return defaultValue;
        return val === '1' || val === 'true';
    }

    static setBoolean(key: string, value: boolean): void {
        URLTools.set(key, value ? '1' : '0');
    }
}
