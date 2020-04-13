(function() {
    /**
     * Element.matches() polyfill.
     * @link https://developer.mozilla.org/ru/docs/Web/API/Element/matches
     */
    (function(e) {
        var matches = e.matches || e.matchesSelector || e.webkitMatchesSelector || e.mozMatchesSelector || e.msMatchesSelector || e.oMatchesSelector;
        !matches ? (e.matches = e.matchesSelector = function matches(selector) {
            var matches = document.querySelectorAll(selector);
            var th = this;
            return Array.prototype.some.call(matches, function(e) {
                return e === th;
            });
        }) : (e.matches = e.matchesSelector = matches);
    })(Element.prototype);

    if (typeof document !== 'undefined') {
        document.addEventListener('click', function (event) {
            if (event.target.matches('.DocLayout__center a')) {
                event.preventDefault();

                var href = event.target.href;
                var httpRegex = /^(https?):\/\//i;

                if (httpRegex.test(href) || href.endsWith('.html') || href.includes('#')) {
                    window.location.href = href;
                    return;
                }

                if (href.endsWith('/')) {
                    window.location.href = href + 'index.html';
                    return;
                }

                window.location.href = href + '.html';
            }
        });
    }
})();
