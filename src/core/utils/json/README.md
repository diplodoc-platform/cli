# JSON Utils

Утилиты для работы с JSON объектами в Diplodoc CLI.

## compareJson

Функция для рекурсивного сравнения двух JSON объектов и получения различий в виде путей к изменённым свойствам.

### Сигнатура

```typescript
function compareJson(oldObj: any, newObj: any): JsonDiff
```

### Типы

```typescript
type JsonDiff = {
    added: string[];    // Пути к добавленным свойствам
    changed: string[];  // Пути к изменённым свойствам
    removed: string[];  // Пути к удалённым свойствам
};
```

### Параметры

- `oldObj` - старый объект для сравнения
- `newObj` - новый объект для сравнения

### Возвращаемое значение

Объект `JsonDiff` с тремя массивами строк, содержащими пути к свойствам:
- `added` - свойства, которые были добавлены в новый объект
- `changed` - свойства, значения которых изменились
- `removed` - свойства, которые были удалены из старого объекта


### Примеры использования

#### Базовое сравнение объектов

```typescript
import {compareJson} from '~/core/utils';

const oldObj = { a: 1, b: 2, c: 3 };
const newObj = { a: 1, b: 5, d: 4 };

const diff = compareJson(oldObj, newObj);
// diff = {
//   added: ['d'],
//   changed: ['b'],
//   removed: ['c']
// }
```

#### Сравнение вложенных объектов

```typescript
const oldObj = {
    user: {
        name: 'Alice',
        settings: {
            theme: 'dark'
        }
    }
};

const newObj = {
    user: {
        name: 'Alice',
        settings: {
            theme: 'light',
            notifications: true
        }
    }
};

const diff = compareJson(oldObj, newObj);
// diff = {
//   added: ['user.settings.notifications'],
//   changed: ['user.settings.theme'],
//   removed: []
// }
```

#### Сравнение массивов

```typescript
const oldObj = {
    items: [1, 2, 3],
    users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
    ]
};

const newObj = {
    items: [1, 5, 3],
    users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob Updated' },
        { id: 3, name: 'Charlie' }
    ]
};

const diff = compareJson(oldObj, newObj);
// diff = {
//   added: ['users[2]'],
//   changed: ['items[1]', 'users[1].name'],
//   removed: []
// }
```

### Применение в watch режиме

Функция особенно полезна для реализации watch режима, где нужно отслеживать изменения в конфигурационных файлах:

```typescript
// В watch режиме
const oldConfig = loadConfig();
const newConfig = loadConfig();

const changes = compareJson(oldConfig, newConfig);

if (changes.added.length > 0 || changes.changed.length > 0 || changes.removed.length > 0) {
    console.log('Configuration changed, rebuilding...');
    // Запуск пересборки
}
``` 