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
    oldObj: any,
    newObj: any,
    path: string,
    added: string[],
    changed: string[],
    removed: string[],
): void {
    // Если оба объекта null/undefined, различий нет
    if (isNullable(oldObj) && isNullable(newObj)) {
        return;
    }

    // Если ключ есть в обоих, но значения отличаются (включая null/undefined)
    if ((isNullable(oldObj) || isNullable(newObj)) && !(isNullable(oldObj) && isNullable(newObj))) {
        changed.push(path);
        return;
    }

    // Если типы объектов разные
    if (typeof oldObj !== typeof newObj) {
        changed.push(path);
        return;
    }

    // Если это примитивы, сравниваем значения
    if (typeof oldObj !== 'object' || typeof newObj !== 'object') {
        if (oldObj !== newObj) {
            changed.push(path);
        }
        return;
    }

    // Если это массивы
    if (Array.isArray(oldObj) && Array.isArray(newObj)) {
        compareArrays(oldObj, newObj, path, added, changed, removed);
        return;
    }

    // Если это объекты
    if (!Array.isArray(oldObj) && !Array.isArray(newObj)) {
        compareObjectProperties(oldObj, newObj, path, added, changed, removed);
        return;
    }

    // Если один массив, а другой объект
    changed.push(path);
}

function addAllPaths(obj: any, path: string, arr: string[]): void {
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
        addAllPaths(obj[key], currentPath, arr);
    }
}

/**
 * Сравнивает два массива
 */
function compareArrays(
    oldArr: any[],
    newArr: any[],
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
    oldObj: Record<string, any>,
    newObj: Record<string, any>,
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
            // Если значения отличаются (включая null/undefined)
            if (
                (isNullable(oldValue) || isNullable(newValue)) &&
                !(isNullable(oldValue) && isNullable(newValue))
            ) {
                changed.push(currentPath);
            } else if (typeof oldValue !== typeof newValue) {
                changed.push(currentPath);
            } else if (typeof oldValue !== 'object' || typeof newValue !== 'object') {
                if (oldValue !== newValue) {
                    changed.push(currentPath);
                }
            } else if (Array.isArray(oldValue) && Array.isArray(newValue)) {
                compareArrays(oldValue, newValue, currentPath, added, changed, removed);
            } else if (!Array.isArray(oldValue) && !Array.isArray(newValue)) {
                compareObjectProperties(oldValue, newValue, currentPath, added, changed, removed);
            } else {
                changed.push(currentPath);
            }
        }
    }
}

function isNullable(value: any): value is null | undefined {
    return value === null || value === undefined;
}
