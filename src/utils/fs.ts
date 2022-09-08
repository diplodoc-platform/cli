import {resolve, join} from 'path';

import {
    getDirs, getFiles,
} from '../services/includers/batteries/common';

function deepFiles(predicate: (name: string) => boolean) {
    return async function deepFilesRec(path: string) {
        const filter = ({name}: {name: string}) => predicate(name);
        const process = ({name}: {name: string}) => join(path, name);

        const [dirs, files] = await Promise.all([
            getDirs(resolve(path)),
            getFiles(resolve(path))
                .then((list) => list.filter(filter))
                .then((mds) => mds.map(process)),
        ]);

        const recurse = await Promise.all(dirs.map(({name}: {name: string}) => deepFilesRec(join(path, name))));

        return [...files, ...recurse.flat(1)];
    };
}

export {deepFiles};

export default {deepFiles};
