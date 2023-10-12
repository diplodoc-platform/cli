export function splitOnChunks<T>(array: T[], chunkSize = 1000) {
    const chunks: T[][] = [];

    for (let i = 0, j = array.length; i < j; i += chunkSize) {
        const chunk: T[] = array.slice(i, i + chunkSize);
        chunks.push(chunk);
    }

    return chunks;
}
