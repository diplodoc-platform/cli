(function() {
    var links = document.querySelectorAll('.DocLayout__center a');

    for (var i = 0; i < links.length; i++) {
        links[i].onclick = function(e) {
            e.preventDefault();
            var href = e.target.href;
            var httpRegex = /^(https?):\/\//i;
            var hashRegex = /#/g;

            if (httpRegex.test(href) || href.endsWith('.html') || hashRegex.test(href)) {
                window.location.href = href;
                return;
            }

            if (href.endsWith('/')) {
                window.location.href = href + 'index.html';
                return;
            }

            window.location.href = href + '.html';
        };
    }
})();
