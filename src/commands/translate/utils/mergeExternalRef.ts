/**
 * Интерфейс для распарсенной внешней ссылки
 */
interface ParsedRef {
    file: string;
    path: string[];
}

/**
 * Тип для функции загрузки внешних файлов
 */
type LoadFunction = (filename: string) => Promise<any>;

/**
 * Парсит ссылку на внешний файл
 * @param ref - Ссылка вида 'common.yaml#/components/schemas/ExternalChildRef'
 * @returns Объект с именем файла и путём к схеме
 */
function parseExternalRef(ref: string): ParsedRef {
    const [file, path] = ref.split('#');
    const pathParts = path ? path.split('/').filter((p) => p) : [];
    return {file, path: pathParts};
}

/**
 * Получает значение по пути из объекта
 * @param obj - Исходный объект
 * @param path - Массив с путём ['components', 'schemas', 'SchemaName']
 * @returns Значение по указанному пути
 */
function getByPath(obj: any, path: string[]): any {
    return path.reduce((current, key) => current?.[key], obj);
}

/**
 * Устанавливает значение по пути в объекте
 * @param obj - Целевой объект
 * @param path - Массив с путём
 * @param value - Значение для установки
 */
function setByPath(obj: any, path: string[], value: any): void {
    const lastKey = path[path.length - 1];
    const parentPath = path.slice(0, -1);

    // Создаём промежуточные объекты, если их нет
    const parent = parentPath.reduce((current, key) => {
        if (!current[key]) {
            current[key] = {};
        }
        return current[key];
    }, obj);

    parent[lastKey] = value;
}

/**
 * Рекурсивно обходит объект и разрешает внешние ссылки
 * @param obj - Объект для обработки
 * @param load - Функция загрузки внешних файлов
 * @param targetSpec - Корневая спецификация, куда подклеиваем схемы
 * @param processed - Множество уже обработанных ссылок (для избежания циклов)
 * @returns Обработанный объект
 */
async function resolveExternalRefs(
    obj: any,
    load: LoadFunction,
    targetSpec: any,
    processed: Set<string> = new Set(),
): Promise<any> {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    // Обрабатываем массивы
    if (Array.isArray(obj)) {
        return Promise.all(
            obj.map((item) => resolveExternalRefs(item, load, targetSpec, processed)),
        );
    }

    // Проверяем наличие $ref
    if (obj.$ref && typeof obj.$ref === 'string') {
        const ref: string = obj.$ref;

        // Проверяем, является ли ссылка внешней
        if (!ref.startsWith('#')) {
            // Избегаем повторной обработки одной и той же ссылки
            if (!processed.has(ref)) {
                processed.add(ref);

                const {file, path} = parseExternalRef(ref);

                try {
                    // Загружаем внешний файл
                    const externalContent = await load(file);

                    // Получаем нужную схему из загруженного файла
                    const schema = getByPath(externalContent, path);

                    if (schema) {
                        // Подклеиваем схему в целевую спецификацию
                        setByPath(targetSpec, path, schema);

                        // Рекурсивно обрабатываем подклеенную схему
                        await resolveExternalRefs(schema, load, targetSpec, processed);
                    } else {
                        console.warn(`Schema not found: ${ref}`);
                    }
                } catch (error) {
                    console.error(`Error loading external reference ${ref}:`, error);
                    throw error;
                }
            }

            // Заменяем внешнюю ссылку на внутреннюю
            return {$ref: '#/' + parseExternalRef(ref).path.join('/')};
        }
    }

    // Рекурсивно обрабатываем все свойства объекта
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        result[key] = await resolveExternalRefs(value, load, targetSpec, processed);
    }

    return result;
}

/**
 * Создаёт глубокую копию объекта
 * @param obj - Объект для копирования
 * @returns Глубокая копия объекта
 */
function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Основная функция для разрешения всех внешних ссылок в спецификации
 * @param spec - OpenAPI спецификация
 * @param load - Функция загрузки внешних файлов
 * @returns Спецификация с разрешёнными ссылками
 */
async function resolveAllExternalRefs<T = any>(spec: T, load: LoadFunction): Promise<T> {
    const result = deepClone(spec);
    await resolveExternalRefs(result, load, result);
    return result;
}

export {
    resolveAllExternalRefs,
    resolveExternalRefs,
    parseExternalRef,
    getByPath,
    setByPath,
    type LoadFunction,
    type ParsedRef,
};
