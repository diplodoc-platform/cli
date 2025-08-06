export type JsonDiff = {
    added: string[];
    changed: string[];
    removed: string[];
};

/**
 * Сравнивает два JSON объекта рекурсивно и возвращает различия
 * @param oldObj - старый объект
 * @param newObj - новый объект
 * @returns Объект с массивами путей к добавленным, изменённым и удалённым свойствам
 */
export function compareJson(oldObj: object, newObj: object): JsonDiff {
    const added: string[] = [];
    const changed: string[] = [];
    const removed: string[] = [];

    compareObjects(oldObj, newObj, '', added, changed, removed);

    return {
        added: added.sort(),
        changed: changed.sort(),
        removed: removed.sort(),
    };
}

/**
 * Рекурсивно сравнивает два объекта и заполняет массивы различий
 * @param oldObj - старый объект
 * @param newObj - новый объект
 * @param path - текущий путь в объекте
 * @param added - массив для добавленных свойств
 * @param changed - массив для изменённых свойств
 * @param removed - массив для удалённых свойств
 */
function compareObjects(
    oldObj: unknown,
    newObj: unknown,
    path: string,
    added: string[],
    changed: string[],
    removed: string[],
): void {
    if (isNullable(oldObj) && isNullable(newObj)) {
        return;
    }

    compareEntity(oldObj, newObj, path, added, changed, removed);
}

function addAllPaths(obj: unknown, path: string, arr: string[]): void {
    if (path) {
        arr.push(path);
    }

    if (typeof obj !== 'object' || obj === null) {
        return;
    }

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            const currentPath = path ? `${path}[${i}]` : `[${i}]`;
            addAllPaths(obj[i], currentPath, arr);
        }
        return;
    }

    for (const key of Object.keys(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        addAllPaths((obj as Hash)[key], currentPath, arr);
    }
}

/**
 * Сравнивает два массива
 */
function compareArrays(
    oldArr: unknown[],
    newArr: unknown[],
    path: string,
    added: string[],
    changed: string[],
    removed: string[],
): void {
    const maxLength = Math.max(oldArr.length, newArr.length);

    for (let i = 0; i < maxLength; i++) {
        const currentPath = path ? `${path}[${i}]` : `[${i}]`;
        const oldItem = oldArr[i];
        const newItem = newArr[i];

        if (i >= oldArr.length) {
            added.push(currentPath);
        } else if (i >= newArr.length) {
            removed.push(currentPath);
        } else {
            compareObjects(oldItem, newItem, currentPath, added, changed, removed);
        }
    }
}

/**
 * Сравнивает свойства двух объектов
 */
function compareObjectProperties(
    oldObj: Hash,
    newObj: Hash,
    path: string,
    added: string[],
    changed: string[],
    removed: string[],
): void {
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
        const currentPath = path ? `${path}.${key}` : key;
        const oldValue = oldObj[key];
        const newValue = newObj[key];

        if (!(key in oldObj)) {
            addAllPaths(newValue, currentPath, added);
        } else if (!(key in newObj)) {
            addAllPaths(oldValue, currentPath, removed);
        } else {
            compareEntity(oldValue, newValue, currentPath, added, changed, removed);
        }
    }
}

function compareEntity(
    oldValue: unknown,
    newValue: unknown,
    path: string,
    added: string[],
    changed: string[],
    removed: string[],
) {
    if (
        (isNullable(oldValue) || isNullable(newValue)) &&
        !(isNullable(oldValue) && isNullable(newValue))
    ) {
        changed.push(path);
    } else if (typeof oldValue !== typeof newValue) {
        changed.push(path);
    } else if (typeof oldValue !== 'object' || typeof newValue !== 'object') {
        if (oldValue !== newValue) {
            changed.push(path);
        }
    } else if (Array.isArray(oldValue) && Array.isArray(newValue)) {
        compareArrays(oldValue, newValue, path, added, changed, removed);
    } else if (!Array.isArray(oldValue) && !Array.isArray(newValue)) {
        compareObjectProperties(oldValue as Hash, newValue as Hash, path, added, changed, removed);
    } else {
        changed.push(path);
    }
}

function isNullable(value: unknown): value is null | undefined {
    return value === null || value === undefined;
}
