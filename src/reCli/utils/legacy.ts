import transformLog from '@diplodoc/transform/lib/log';

export function readTransformLog() {
    const typeMessages = transformLog.get();
    Object.keys(typeMessages).forEach((type) => {
        const messages = typeMessages[type as keyof typeof typeMessages] ?? [];
        messages.forEach((msg) => {
            console.log(msg);
        });
    });
    transformLog.clear();
}
