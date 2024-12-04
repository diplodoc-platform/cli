export function isRelative(path: AnyPath): path is RelativePath {
    return /^\.{1,2}\//.test(path) || !/^(\w{0,7}:)?\/\//.test(path);
}
