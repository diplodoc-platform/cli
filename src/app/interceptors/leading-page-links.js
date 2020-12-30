(function () {
    /**
     * Element.matches() polyfill.
     * @link https://developer.mozilla.org/ru/docs/Web/API/Element/matches
     */
    (function (e) {
        const matches = e.matches
            || e.matchesSelector
            || e.webkitMatchesSelector
            || e.mozMatchesSelector
            || e.msMatchesSelector
            || e.oMatchesSelector;

        if (matches) {
            e.matches = e.matchesSelector = matches;
        } else {
            e.matches = e.matchesSelector = function (selector) {
                const th = this;
                return Array.prototype.some.call(document.querySelectorAll(selector), (el) => {
                    return el === th;
                });
            };
        }
    })(Element.prototype);

    if (typeof document !== 'undefined') {
        document.addEventListener('click', (event) => {
            if (event.target.matches('.dc-doc-layout__center a')) {
                event.preventDefault();

                const href = event.target.href;
                const locationOrigin = window.location.origin;

                if (href.startsWith(locationOrigin)) {
                    const mainFileName = 'index';
                    const extention = '.html';

                    if (href.endsWith('/')) {
                        window.location.href = `${href}${mainFileName}${extention}`;
                        return;
                    }

                    if (href.endsWith(`/${mainFileName}`)) {
                        window.location.href = `${href}${extention}`;
                        return;
                    }

                    const splitedHref = href.split('#');
                    if (splitedHref.length > 1 && !splitedHref[0].endsWith(extention)) {
                        splitedHref[0] += extention;
                        window.location.href = splitedHref.join('');
                        return;
                    }
                }

                window.location.href = href;
            }
        });
    }
})();
