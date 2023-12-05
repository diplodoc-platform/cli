import {ArgvService} from '../services';

const filterByLang = (tocFilePaths: string[]): string[] => {
    const {langs} = ArgvService.getConfig();
    if (langs && langs.length) {
        return tocFilePaths.filter((path) => langs.includes(path.split('/')[0]));
    }
    return tocFilePaths;
};

export {filterByLang};

export default {filterByLang};
