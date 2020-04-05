export default class Router {
    constructor({pathname}) {
        this.pathname = pathname;
    }

    urlIsNew(pathname, query) {}

    handlePopState = (event) => {}

    back() {}

    push(url, as = url, options = {}) {}

    replace(url, as = url, options = {}) {}

    changeState(method, url, as, options) {}

    change(originMethod, url, as, options) {}

    getRouteInfo(route, pathname, query, as) {}

    set(route, pathname, query, as, data) {}

    getParams() {}

    paramsChanged() {}

    onlyHashChange(as) {}

    scrollToHash(as) {}

    notify(data) {}

    subscribe(fn) {}
}
