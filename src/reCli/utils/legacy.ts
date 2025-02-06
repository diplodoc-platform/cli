import transformLog from '@diplodoc/transform/lib/log';
import {LogLevels} from '@diplodoc/transform/src/transform/log';

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

export function getLog() {
    return {
        [LogLevels.INFO]: console.log.bind(console, 'INFO'),
        [LogLevels.WARN]: console.log.bind(console, 'WARN'),
        [LogLevels.ERROR]: console.log.bind(console, 'ERROR'),
    };
}
