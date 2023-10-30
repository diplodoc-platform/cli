export function splitOnChunks<T>(array: T[], chunkSize = 1000) {
    const chunks: T[][] = [];

    for (let i = 0, j = array.length; i < j; i += chunkSize) {
        const chunk: T[] = array.slice(i, i + chunkSize);
        chunks.push(chunk);
    }

    return chunks;
}

export function mapToObject<V>(map: Map<string, V>) {
    const obj: Record<string, V> = {};
    map.forEach((value, key) => {
        obj[key] = value;
    });
    return obj;
}

export function objFillMap<V>(obj: Record<string, V>, map: Map<string, V>) {
    Object.entries(obj).forEach(([key, value]) => {
        map.set(key, value);
    });
}
