import libglob, {IGlob, IOptions} from 'glob';

export type Glob = {state: IGlob};

const glob = async (pattern: string, options: IOptions): Promise<Glob> =>
    new Promise((res, rej) => {
        const state: IGlob = libglob(pattern, options, (err) => (err ? rej(err) : res({state})));
    });

export {glob};

export default {glob};
