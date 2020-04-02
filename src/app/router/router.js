export default class Router {
    constructor() {
    }

    urlIsNew(pathname, query) {}

    handlePopState = (event) => {}

    back() {}

    push(url, as = url, options = {}) {}

    replace(url, as = url, options = {});

    changeState(method, url, as, options) {}

    async change(originMethod, url, as, options) {}

    // eslint-disable-next-line complexity
    async getRouteInfo(route, pathname, query, as) {}

    set(route, pathname, query, as, data) {}

    getParams() {}

    paramsChanged() {}

    onlyHashChange(as) {}

    scrollToHash(as) {}

    notify(data) {}

    subscribe(fn) {}
}
