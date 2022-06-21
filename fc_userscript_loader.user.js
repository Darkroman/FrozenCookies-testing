// ==UserScript==
// @name           Frozen Cookies
// @version        github-latest
// @description    Userscript to load Frozen Cookies
// @author         Icehawk78 / erbkaiser
// @homepage       https://darkroman.github.io/FrozenCookies-testing/
// @include        http://orteil.dashnet.org/cookieclicker/
// @include        https://orteil.dashnet.org/cookieclicker/
// @updateURL      https://darkroman.github.io/FrozenCookiesTesting/fc_userscript_loader.user.js
// @downloadURL    https://darkroman.github.io/FrozenCookiesTesting/fc_userscript_loader.user.js
// ==/UserScript==

// Source:    https://github.com/darkroman/FrozenCookiesTesting/
// Github.io: https://darkroman.github.io/FrozenCookiesTesting/
var loadInterval = setInterval(function() {
    const Game = unsafeWindow.Game;
    if (Game && Game.ready) {
        clearInterval(loadInterval);
        Game.LoadMod("https://darkroman.github.io/FrozenCookiesTesting/frozen_cookies.js");
    }
}, 1000);
