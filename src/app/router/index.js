import Router from './router';

const SingletonRouter = {
    router: null,
};

const propertyFields = ['route', 'pathname', 'query', 'as'];
const coreMethodFields = ['push', 'replace', 'reload', 'back'];

propertyFields.forEach((field) => {
    Object.defineProperty(SingletonRouter, field, {
        get() {
            return SingletonRouter.router[field];
        },
    });
});

coreMethodFields.forEach((field) => {
    SingletonRouter[field] = (...args) => {
        return SingletonRouter.router[field](...args);
    };
});

export function createRouter(...args) {
    SingletonRouter.router = new Router(...args);

    return SingletonRouter.router;
}

export default SingletonRouter;
