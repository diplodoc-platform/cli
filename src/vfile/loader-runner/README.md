### About this directory

There is stored reimplemented [loader-runner](https://www.npmjs.com/package/loader-runner) with some principal changes.

### Changes
- Abstracted from file system. Original package looks modules directly on file system.
In this version we expect, what modules already loaded im memory.
- Loader context is trimmed. Removed useless for `yfm` architecrure methods and fields (`addContextDependency` etc.)
- Cosmetic. Splitted on small files. Rewritten on TS.