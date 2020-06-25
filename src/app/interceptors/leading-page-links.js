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
                const pathWithExtRegex = /\.\w+$/i;

                if (!href.startsWith('http')) {
                    if (href.endsWith('/')) {
                        window.location.href = href + 'index.html';
                        return;
                    }

                    if (!pathWithExtRegex.test(href)) {
                        window.location.href = href + '.html';
                        return;
                    }
                }

                window.location.href = href;
            }
        });
    }
})();
