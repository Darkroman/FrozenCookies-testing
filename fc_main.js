// Add polyfills:
(function(global) {
    var global_isFinite = global.isFinite;
    Object.defineProperty(Number, "isFinite", {
        value: function isFinite(value) {
            return typeof value === "number" && global_isFinite(value);
        },
        configurable: true,
        enumerable: false,
        writable: true,
    });
})(this);

function registerMod(mod_id = "frozen_cookies") {
    // register with the modding API
    Game.registerMod(mod_id, {
        init: function() {
            Game.registerHook("reincarnate", function() {
                // called when the player has reincarnated after an ascension
                if (FrozenCookies.autoBulk != 0) {
                    if (FrozenCookies.autoBulk == 1) {
                        // Buy x10
                        document.getElementById("storeBulk10").click();
                    }
                    if (FrozenCookies.autoBulk == 2) {
                        // Buy x100
                        document.getElementById("storeBulk100").click();
                    }
                }
            });
            Game.registerHook("draw", updateTimers); // called every draw tick
            // Game.registerHook("ticker", function() {
            // called when determining news ticker text (about every ten seconds); should return an array of possible choices to add
            // return [
            //     "News: Debate about whether using Frozen Cookies constitutes cheating continues to rage. Violence escalating.",
            //     "News: Supreme Court rules Frozen Cookies not unauthorized cheating after all.",
            // ];
            // });
            Game.registerHook("reset", function(hard) {
                // the parameter will be true if it's a hard reset, and false (not passed) if it's just an ascension
                if (hard) {
                    emptyCaches();
                    // if the user is starting fresh, code will likely need to be called to reinitialize some historical data here as well
                }
            });
            /*  other hooks that can be used
                  Game.registerHook('logic', function () {   // called every logic tick. seems to correspond with fps
                  });
                  Game.registerHook('reincarnate', function () {
                  });
                  Game.registerHook('check', function () {   // called every few seconds when we check for upgrade/achiev unlock conditions; you can also use this for other checks that you don't need happening every logic frame. called about every five seconds?
                  });
                  Game.registerHook('cps', function (cps) { // called when determining the CpS; parameter is the current CpS; should return the modified CpS. called on change or about every ten seconds
                      return cps;
                  });
                  Game.registerHook('cookiesPerClick', function (cookiesPerClick) { // called when determining the cookies per click; parameter is the current value; should return the modified value. called on change or about every ten seconds
                      return cookiesPerClick;
                  });
                  Game.registerHook('click', function () {    // called when the big cookie is clicked
                  });
                  Game.registerHook('create', function () {   // called after the game declares all buildings, upgrades and achievs; use this to declare your own - note that saving/loading functionality for custom content is not explicitly implemented and may be unpredictable and broken
                  });
                  */
        },
        save: saveFCData,
        load: setOverrides, // called whenever a game save is loaded. If the mod has data in the game save when the mod is initially registered, this hook is also called at that time as well.
    });

    // If Frozen Cookes was loaded and there was previous Frozen Cookies data in the game save, the "load" hook ran so the setOverrides function was called and things got initialized.
    // However, if there wasn't previous Frozen Cookies data in the game save, the "load" hook wouldn't have been called. So, we have to manually call setOverrides here to start Frozen Cookies.
    if (!FrozenCookies.loadedData) {
        setOverrides();
    }
    logEvent(
        "Load",
        "Initial Load of Frozen Cookies v " +
        FrozenCookies.branch +
        "." +
        FrozenCookies.version +
        ". (You should only ever see this once.)"
    );
}

function setOverrides(gameSaveData) {
    // load settings and initialize variables
    // If gameSaveData wasn't passed to this function, it means that there was nothing for this mod in the game save when the mod was loaded
    // In that case, set the "loadedData" var to an empty object. When the loadFCData() function runs and finds no data from the game save,
    // it pulls data from local storage or sets default values
    if (gameSaveData) {
        FrozenCookies.loadedData = JSON.parse(gameSaveData);
    } else {
        FrozenCookies.loadedData = {};
    }
    loadFCData();
    FrozenCookies.frequency = 100;
    FrozenCookies.efficiencyWeight = 1.0;

    // Becomes 0 almost immediately after user input, so default to 0
    FrozenCookies.timeTravelAmount = 0;

    // Force redraw every 10 purchases
    FrozenCookies.autobuyCount = 0;

    // Set default values for calculations
    FrozenCookies.hc_gain = 0;
    FrozenCookies.hc_gain_time = Date.now();
    FrozenCookies.last_gc_state =
        (Game.hasBuff("Frenzy") ? Game.buffs["Frenzy"].multCpS : 1) *
        clickBuffBonus();
    FrozenCookies.last_gc_time = Date.now();
    FrozenCookies.lastCPS = Game.cookiesPs;
    FrozenCookies.lastBaseCPS = Game.cookiesPs;
    FrozenCookies.lastCookieCPS = 0;
    FrozenCookies.lastUpgradeCount = 0;
    FrozenCookies.currentBank = {
        cost: 0,
        efficiency: 0,
    };
    FrozenCookies.targetBank = {
        cost: 0,
        efficiency: 0,
    };
    FrozenCookies.disabledPopups = true;
    FrozenCookies.trackedStats = [];
    FrozenCookies.lastGraphDraw = 0;
    FrozenCookies.calculatedCpsByType = {};

    // Allow autoCookie to run
    FrozenCookies.processing = false;
    FrozenCookies.priceReductionTest = false;

    FrozenCookies.cookieBot = 0;
    FrozenCookies.autoclickBot = 0;
    FrozenCookies.autoFrenzyBot = 0;
    FrozenCookies.frenzyClickBot = 0;

    // Smart tracking details
    FrozenCookies.smartTrackingBot = 0;
    FrozenCookies.minDelay = 1000 * 10; // 10s minimum reporting between purchases with "smart tracking" on
    FrozenCookies.delayPurchaseCount = 0;

    // Caching
    emptyCaches();

    //Whether to currently display achievement popups
    FrozenCookies.showAchievements = true;

    if (!blacklist[FrozenCookies.blacklist]) {
        FrozenCookies.blacklist = 0;
    }

    // Set `App`, on older version of CC it's not set to anything, so default it to `undefined`
    if (!window.App) window.App = undefined;

    Beautify = fcBeautify;
    Game.sayTime = function(time, detail) {
        return timeDisplay(time / Game.fps);
    };
    if (typeof Game.tooltip.oldDraw != "function") {
        Game.tooltip.oldDraw = Game.tooltip.draw;
        Game.tooltip.draw = fcDraw;
    }
    if (typeof Game.oldReset != "function") {
        Game.oldReset = Game.Reset;
        Game.Reset = fcReset;
    }
    Game.Win = fcWin;
    // Remove the following when turning on tooltop code
    nextPurchase(true);
    Game.RefreshStore();
    Game.RebuildUpgrades();
    beautifyUpgradesAndAchievements();
    // Replace Game.Popup references with event logging
    eval(
        "Game.shimmerTypes.golden.popFunc = " +
        Game.shimmerTypes.golden.popFunc
        .toString()
        .replace(/Game\.Popup\((.+)\)\;/g, 'logEvent("GC", $1, true);')
    );
    eval(
        "Game.UpdateWrinklers = " +
        Game.UpdateWrinklers.toString().replace(
            /Game\.Popup\((.+)\)\;/g,
            'logEvent("Wrinkler", $1, true);'
        )
    );
    eval(
        "FrozenCookies.safeGainsCalc = " +
        Game.CalculateGains.toString()
        .replace(/eggMult\+=\(1.+/, "eggMult++; // CENTURY EGGS SUCK")
        .replace(/Game\.cookiesPs/g, "FrozenCookies.calculatedCps")
        .replace(/Game\.globalCpsMult/g, "mult")
    );

    // Give free achievements!
    if (!Game.HasAchiev("Third-party")) {
        Game.Win("Third-party");
    }

    function loadFCData() {
        // Set all cycleable preferences
        _.keys(FrozenCookies.preferenceValues).forEach(function(preference) {
            FrozenCookies[preference] = preferenceParse(
                preference,
                FrozenCookies.preferenceValues[preference].default
            );
        });
        // Separate because these are user-input values
        FrozenCookies.cookieClickSpeed = preferenceParse("cookieClickSpeed", 0);
        FrozenCookies.frenzyClickSpeed = preferenceParse("frenzyClickSpeed", 0);
        FrozenCookies.HCAscendAmount = preferenceParse("HCAscendAmount", 0);
        FrozenCookies.minCpSMult = preferenceParse("minCpSMult", 1);
        FrozenCookies.maxSpecials = preferenceParse("maxSpecials", 1);
        FrozenCookies.minLoanMult = preferenceParse("minLoanMult", 1);

        // building max values
        FrozenCookies.mineMax = preferenceParse("mineMax", 0);
        FrozenCookies.factoryMax = preferenceParse("factoryMax", 0);
        FrozenCookies.manaMax = preferenceParse("manaMax", 0);

        // Get historical data
        FrozenCookies.frenzyTimes =
            JSON.parse(
                FrozenCookies.loadedData["frenzyTimes"] ||
                localStorage.getItem("frenzyTimes")
            ) || {};
        //  FrozenCookies.non_gc_time = Number(FrozenCookies.loadedData['nonFrenzyTime']) || Number(localStorage.getItem('nonFrenzyTime')) || 0;
        //  FrozenCookies.gc_time = Number(FrozenCookies.loadedData['frenzyTime']) || Number(localStorage.getItem('frenzyTime')) || 0;;
        FrozenCookies.lastHCAmount = preferenceParse("lastHCAmount", 0);
        FrozenCookies.lastHCTime = preferenceParse("lastHCTime", 0);
        FrozenCookies.prevLastHCTime = preferenceParse("prevLastHCTime", 0);
        FrozenCookies.maxHCPercent = preferenceParse("maxHCPercent", 0);
        if (Object.keys(FrozenCookies.loadedData).length > 0) {
            logEvent("Load", "Restored Frozen Cookies settings from previous save");
        }
    }

    function preferenceParse(setting, defaultVal) {
        var value = defaultVal;
        if (setting in FrozenCookies.loadedData) {
            // first look in the data from the game save
            value = FrozenCookies.loadedData[setting];
        } else if (localStorage.getItem(setting)) {
            // if the setting isn't there, check localStorage
            value = localStorage.getItem(setting);
        }
        return Number(value); // if not overridden by game save or localStorage, defaultVal is returned
    }
    FCStart();
}

function decodeHtml(html) {
    // used to convert text with an HTML entity (like "&eacute;") into readable text
    var txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
}

function emptyCaches() {
    FrozenCookies.recalculateCaches = true;
    FrozenCookies.caches = {};
    FrozenCookies.caches.nextPurchase = {};
    FrozenCookies.caches.recommendationList = [];
    FrozenCookies.caches.buildings = [];
    FrozenCookies.caches.upgrades = [];
}

function scientificNotation(value) {
    if (
        value === 0 ||
        !Number.isFinite(value) ||
        (Math.abs(value) >= 1 && Math.abs(value) <= 1000)
    ) {
        return rawFormatter(value);
    }
    value = parseFloat(value);
    value = value.toExponential(2);
    value = value.replace("+", "");
    return value;
}

var numberFormatters = [
    rawFormatter,
    formatEveryThirdPower([
        "",
        " million",
        " billion",
        " trillion",
        " quadrillion",
        " quintillion",
        " sextillion",
        " septillion",
        " octillion",
        " nonillion",
        " decillion",
        " undecillion",
        " duodecillion",
        " tredecillion",
        " quattuordecillion",
        " quindecillion",
        " sexdecillion",
        " septendecillion",
        " octodecillion",
        " novemdecillion",
        " vigintillion",
        " unvigintillion",
        " duovigintillion",
        " trevigintillion",
        " quattuorvigintillion",
        " quinvigintillion",
        " sexvigintillion",
        " septenvigintillion",
        " octovigintillion",
        " novemvigintillion",
        " trigintillion",
        " untrigintillion",
        " duotrigintillion",
        " tretrigintillion",
        " quattuortrigintillion",
        " quintrigintillion",
        " sextrigintillion",
        " septentrigintillion",
        " octotrigintillion",
        " novemtrigintillion",
    ]),

    formatEveryThirdPower([
        "",
        " M",
        " B",
        " T",
        " Qa",
        " Qi",
        " Sx",
        " Sp",
        " Oc",
        " No",
        " De",
        " UnD",
        " DoD",
        " TrD",
        " QaD",
        " QiD",
        " SxD",
        " SpD",
        " OcD",
        " NoD",
        " Vg",
        " UnV",
        " DoV",
        " TrV",
        " QaV",
        " QiV",
        " SxV",
        " SpV",
        " OcV",
        " NoV",
        " Tg",
        " UnT",
        " DoT",
        " TrT",
        " QaT",
        " QiT",
        " SxT",
        " SpT",
        " OcT",
        " NoT",
    ]),

    formatEveryThirdPower(["", " M", " G", " T", " P", " E", " Z", " Y"]),
    scientificNotation,
];

function fcBeautify(value) {
    var negative = value < 0;
    value = Math.abs(value);
    var formatter = numberFormatters[FrozenCookies.numberDisplay];
    var output = formatter(value)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return negative ? "-" + output : output;
}

// Runs numbers in upgrades and achievements through our beautify function
function beautifyUpgradesAndAchievements() {
    function beautifyFn(str) {
        return Beautify(parseInt(str.replace(/,/, ""), 10));
    }

    var numre = /\d\d?\d?(?:,\d\d\d)*/;
    Object.values(Game.AchievementsById).forEach(function(ach) {
        ach.desc = ach.desc.replace(numre, beautifyFn);
    });

    // These might not have any numbers in them, but just in case...
    Object.values(Game.UpgradesById).forEach(function(upg) {
        upg.desc = upg.desc.replace(numre, beautifyFn);
    });
}

function timeDisplay(seconds) {
    if (seconds === "---" || seconds === 0) {
        return "Done!";
    } else if (seconds == Number.POSITIVE_INFINITY) {
        return "Never!";
    }
    seconds = Math.floor(seconds);
    var days, hours, minutes;
    days = Math.floor(seconds / (24 * 60 * 60));
    days = days > 0 ? Beautify(days) + "d " : "";
    seconds %= 24 * 60 * 60;
    hours = Math.floor(seconds / (60 * 60));
    hours = hours > 0 ? hours + "h " : "";
    seconds %= 60 * 60;
    minutes = Math.floor(seconds / 60);
    minutes = minutes > 0 ? minutes + "m " : "";
    seconds %= 60;
    seconds = seconds > 0 ? seconds + "s" : "";
    return (days + hours + minutes + seconds).trim();
}

function fcDraw(from, text, origin) {
    if (typeof text == "string") {
        if (text.includes("Devastation")) {
            text = text.replace(
                /\+\d+\%/,
                "+" +
                Math.round((Game.hasBuff("Devastation").multClick - 1) * 100) +
                "%"
            );
        }
    }
    Game.tooltip.oldDraw(from, text, origin);
}

function fcReset() {
    Game.CollectWrinklers();
    if (
        (Game.dragonLevel > 5 && !Game.hasAura("Earth Shatterer")) &&
        Game.HasUnlocked("Chocolate egg") && !Game.Has("Chocolate egg")) {
        Game.SetDragonAura(5, 0);
        Game.ConfirmPrompt();
        Game.ObjectsById.forEach(function(b) {
            b.sell(-1);
        });
        Game.Upgrades["Chocolate egg"].buy();
    } else if (Game.HasUnlocked("Chocolate egg") && !Game.Has("Chocolate egg")) {
        Game.ObjectsById.forEach(function(b) {
            b.sell(-1);
        });
        Game.Upgrades["Chocolate egg"].buy();
    }
    Game.oldReset();
    FrozenCookies.frenzyTimes = {};
    FrozenCookies.last_gc_state =
        (Game.hasBuff("Frenzy") ? Game.buffs["Frenzy"].multCpS : 1) *
        clickBuffBonus();
    FrozenCookies.last_gc_time = Date.now();
    FrozenCookies.lastHCAmount = Game.HowMuchPrestige(
        Game.cookiesEarned + Game.cookiesReset + wrinklerValue()
    );
    FrozenCookies.lastHCTime = Date.now();
    FrozenCookies.maxHCPercent = 0;
    FrozenCookies.prevLastHCTime = Date.now();
    FrozenCookies.lastCps = 0;
    FrozenCookies.lastBaseCps = 0;
    FrozenCookies.trackedStats = [];
    recommendationList(true);
}

function saveFCData() {
    var saveString = {};
    _.keys(FrozenCookies.preferenceValues).forEach(function(preference) {
        saveString[preference] = FrozenCookies[preference];
    });
    saveString.frenzyClickSpeed = FrozenCookies.frenzyClickSpeed;
    saveString.cookieClickSpeed = FrozenCookies.cookieClickSpeed;
    saveString.HCAscendAmount = FrozenCookies.HCAscendAmount;
    saveString.mineMax = FrozenCookies.mineMax;
    saveString.factoryMax = FrozenCookies.factoryMax;
    saveString.minCpSMult = FrozenCookies.minCpSMult;
    saveString.minLoanMult = FrozenCookies.minLoanMult;
    saveString.frenzyTimes = JSON.stringify(FrozenCookies.frenzyTimes);
    //  saveString.nonFrenzyTime = FrozenCookies.non_gc_time;
    //  saveString.frenzyTime = FrozenCookies.gc_time;
    saveString.lastHCAmount = FrozenCookies.lastHCAmount;
    saveString.maxHCPercent = FrozenCookies.maxHCPercent;
    saveString.lastHCTime = FrozenCookies.lastHCTime;
    saveString.manaMax = FrozenCookies.manaMax;
    saveString.maxSpecials = FrozenCookies.maxSpecials;
    saveString.prevLastHCTime = FrozenCookies.prevLastHCTime;
    saveString.saveVersion = FrozenCookies.version;
    return JSON.stringify(saveString);
}

function divCps(value, cps) {
    var result = 0;
    if (value) {
        if (cps) {
            result = value / cps;
        } else {
            result = Number.POSITIVE_INFINITY;
        }
    }
    return result;
}

function nextHC(tg) {
    var futureHC = Math.ceil(
        Game.HowMuchPrestige(Game.cookiesEarned + Game.cookiesReset)
    );
    var nextHC = Game.HowManyCookiesReset(futureHC);
    var toGo = nextHC - (Game.cookiesEarned + Game.cookiesReset);
    return tg ? toGo : timeDisplay(divCps(toGo, Game.cookiesPs));
}

function copyToClipboard(text) {
    Game.promptOn = 1;
    window.prompt("Copy to clipboard: Ctrl+C, Enter", text);
    Game.promptOn = 0;
}

function getBuildingSpread() {
    return Game.ObjectsById.map(function(a) {
        return a.amount;
    }).join("/");
}

// todo: add bind for autoascend
// Press 'a' to toggle autobuy.
// Press 'b' to pop up a copyable window with building spread.
// Press 'c' to toggle auto-GC
// Press 'e' to pop up a copyable window with your export string
// Press 'r' to pop up the reset window
// Press 's' to do a manual save
// Press 'w' to display a wrinkler-info window
document.addEventListener("keydown", function(event) {
    if (!Game.promptOn && FrozenCookies.FCshortcuts) {
        if (event.keyCode == 65) {
            Game.Toggle("autoBuy", "autobuyButton", "Autobuy OFF", "Autobuy ON");
            toggleFrozen("autoBuy");
        }
        if (event.keyCode == 66) {
            copyToClipboard(getBuildingSpread());
        }
        if (event.keyCode == 67) {
            Game.Toggle(
                "autoGC",
                "autogcButton",
                "Autoclick GC OFF",
                "Autoclick GC ON"
            );
            toggleFrozen("autoGC");
        }
        if (event.keyCode == 69) {
            copyToClipboard(Game.WriteSave(true));
        }
        if (event.keyCode == 82) {
            Game.Reset();
        }
        if (event.keyCode == 83) {
            Game.WriteSave();
        }
        if (event.keyCode == 87) {
            Game.Notify(
                "Wrinkler Info",
                "Popping all wrinklers will give you " +
                Beautify(wrinklerValue()) +
                ' cookies. <input type="button" value="Click here to pop all wrinklers" onclick="Game.CollectWrinklers()"></input>',
                [19, 8],
                7
            );
        }
    }
});

function writeFCButton(setting) {
    var current = FrozenCookies[setting];
}

function userInputPrompt(title, description, existingValue, callback) {
    Game.Prompt(`<h3>${title}</h3><div class="block" style="text-align:center;">${description}</div><div class="block"><input type="text" style="text-align:center;width:100%;" id="fcGenericInput" value="${existingValue}"/></div>`,
        [
            'Confirm',
            'Cancel'
        ]);
    $('#promptOption0').click(() => {
        callback(l('fcGenericInput').value)
    });
    l('fcGenericInput').focus();
    l('fcGenericInput').select();
}

function validateNumber(value, minValue = null, maxValue = null) {
    if (typeof value == "undefined" ||
        value == null) {
        return false;
    }
    const numericValue = Number(value);
    return !isNaN(numericValue) &&
        (minValue == null || numericValue >= minValue) &&
        (maxValue == null || numericValue <= maxValue);
}

function storeNumberCallback(base, min, max) {
    return (result) => {
        if (!validateNumber(result, min, max)) {
            result = FrozenCookies[base];
        }
        FrozenCookies[base] = Number(result);
        FCStart();
    }
}

function updateSpeed(base) {
    userInputPrompt(
        'Autoclicking!',
        "How many times per second do you want to click? (999 max)",
        FrozenCookies[base],
        storeNumberCallback(base, 0, 999)
    );
}

function updateCpSMultMin(base) {
    userInputPrompt(
        'Autocasting!',
        'What CpS multiplier should trigger Auto Casting (e.g. "7" will trigger during a Frenzy, "1" prevents triggering during a clot, etc.)?',
        FrozenCookies[base],
        storeNumberCallback(base, 0)
    );
}

function updateAscendAmount(base) {
    userInputPrompt(
        'Autoascending!',
        'How many heavenly chips do you want to auto-ascend at?',
        FrozenCookies[base],
        storeNumberCallback(base, 1)
    );
}

function updateManaMax(base) {
    userInputPrompt(
        'Mana Cap!',
        'Choose a maximum mana amount',
        FrozenCookies[base],
        storeNumberCallback(base, 0)
    );
}

function updateMaxSpecials(base) {
    userInputPrompt(
        'Harvest Bank!',
        'Set amount of stacked Building specials for Harvest Bank',
        FrozenCookies[base],
        storeNumberCallback(base, 0)
    );
}

function updateMineMax(base) {
    userInputPrompt(
        'Mine Cap!',
        'How many Mines should Autobuy stop at?',
        FrozenCookies[base],
        storeNumberCallback(base, 0)
    );
}

function updateFactoryMax(base) {
    userInputPrompt(
        'Factory Cap!',
        'How many Factories should Autobuy stop at?',
        FrozenCookies[base],
        storeNumberCallback(base, 0)
    );
}

function updateTimeTravelAmount() {
    userInputPrompt(
        'Time Travel!',
        "Warning: Time travel is highly unstable, and large values are highly likely to either cause long delays or crash the game. Be careful!\nHow much do you want to time travel by? This will happen instantly.",
        FrozenCookies.timeTravelAmount,
        storeNumberCallback('timeTravelAmount', 0)
    );
}

function updateLoanMultMin(base) {
    userInputPrompt(
        'Loans!',
        'What CpS multiplier should trigger taking loans (e.g. "7" will trigger for a normal Frenzy, "500" will require a huge building buff combo, etc.)?',
        FrozenCookies[base],
        storeNumberCallback(base, 0)
    );
}

function cyclePreference(preferenceName) {
    var preference = FrozenCookies.preferenceValues[preferenceName];
    if (preference) {
        var display = preference.display;
        var current = FrozenCookies[preferenceName];
        var preferenceButton = $("#" + preferenceName + "Button");
        if (
            display &&
            display.length > 0 &&
            preferenceButton &&
            preferenceButton.length > 0
        ) {
            var newValue = (current + 1) % display.length;
            preferenceButton[0].innerText = display[newValue];
            FrozenCookies[preferenceName] = newValue;
            FrozenCookies.recalculateCaches = true;
            Game.RefreshStore();
            Game.RebuildUpgrades();
            FCStart();
        }
    }
}

function toggleFrozen(setting) {
    if (!FrozenCookies[setting]) {
        FrozenCookies[setting] = 1;
    } else {
        FrozenCookies[setting] = 0;
    }
    FCStart();
}

var G = Game.Objects["Farm"].minigame;
var B = Game.Objects["Bank"].minigame;
var T = Game.Objects["Temple"].minigame;
var M = Game.Objects["Wizard tower"].minigame;

function rigiSell() {
    //Sell enough of the cheapest building to enable Rigidels effect
    if (Game.BuildingsOwned % 10) {
        var cheapest;
        Game.ObjectsById.forEach(function(b) {
            if (!cheapest || b.price < cheapest.price) {
                cheapest = b;
            }
        });
        cheapest.sell(Game.BuildingsOwned % 10);
    }
    return;
}

function lumpIn(mins) {
    //For debugging, set minutes until next lump is *ripe*
    Game.lumpT = Date.now() - Game.lumpRipeAge + 60000 * mins;
}

function swapIn(godId, targetSlot) {
    //mostly code copied from minigamePantheon.js, tweaked to avoid references to "dragging"
    if (T.swaps == 0) return;
    T.useSwap(1);
    T.lastSwapT = 0;
    var div = l("templeGod" + godId);
    var prev = T.slot[targetSlot]; //id of God currently in slot
    if (prev != -1) {
        //when something's in there already
        prev = T.godsById[prev]; //prev becomes god object
        var prevDiv = l("templeGod" + prev.id);
        if (T.godsById[godId].slot != -1)
            l("templeSlot" + T.godsById[godId].slot).appendChild(prevDiv);
        else {
            var other = l("templeGodPlaceholder" + prev.id);
            other.parentNode.insertBefore(prevDiv, other);
        }
    }
    l("templeSlot" + targetSlot).appendChild(l("templeGod" + godId));
    T.slotGod(T.godsById[godId], targetSlot);

    PlaySound("snd/tick.mp3");
    PlaySound("snd/spirit.mp3");

    var rect = l("templeGod" + godId).getBoundingClientRect();
    Game.SparkleAt(
        (rect.left + rect.right) / 2,
        (rect.top + rect.bottom) / 2 - 24
    );
}

function autoRigidel() {
    if (!T) return; //Exit if pantheon doesnt even exist
    var timeToRipe =
        (Math.ceil(Game.lumpRipeAge) - (Date.now() - Game.lumpT)) / 60000; //Minutes until sugar lump ripens
    var orderLvl = Game.hasGod("order") ? Game.hasGod("order") : 0;
    switch (orderLvl) {
        case 0: //Rigidel isn't in a slot
            if (T.swaps < 2 || (T.swaps == 1 && T.slot[0] == -1)) return; //Don't do anything if we can't swap Rigidel in
            if (timeToRipe < 60) {
                var prev = T.slot[0]; //cache whatever god you have equipped
                swapIn(10, 0); //swap in rigidel
                // Turn off autobuy
                if (FrozenCookies.autoBuy == 1) {
                    autoRigidel.autobuyyes = 1;
                    FrozenCookies.autoBuy = 0;
                } else {
                    autoRigidel.autobuyyes = 0;
                }
                rigiSell(); //Meet the %10 condition
                Game.computeLumpTimes();
                if (Date.now() - started >= ripeAge) {
                    Game.clickLump();
                }
                // Game.clickLump(); //harvest the ripe lump, AutoSL probably covers this but this should avoid issues with autoBuy going first and disrupting Rigidel
                // Turn autobuy back on if on before
                if (autoRigidel.autobuyyes == 1) {
                    FrozenCookies.autoBuy = 1;
                }
                if (prev != -1) swapIn(prev, 0); //put the old one back
            }
        case 1: //Rigidel is already in diamond slot
            if (timeToRipe < 60 && Game.BuildingsOwned % 10) {
                // Turn off autobuy
                if (FrozenCookies.autoBuy == 1) {
                    autoRigidel.autobuyyes = 1;
                    FrozenCookies.autoBuy = 0;
                } else {
                    autoRigidel.autobuyyes = 0;
                }
                rigiSell();
                Game.computeLumpTimes();
                if (Date.now() - started >= ripeAge) {
                    Game.clickLump();
                }
                // Turn autobuy back on if on before
                if (autoRigidel.autobuyyes == 1) {
                    FrozenCookies.autoBuy = 1;
                }
            }
        case 2: //Rigidel in Ruby slot,
            if (timeToRipe < 40 && Game.BuildingsOwned % 10) {
                // Turn off autobuy
                if (FrozenCookies.autoBuy == 1) {
                    autoRigidel.autobuyyes = 1;
                    FrozenCookies.autoBuy = 0;
                } else {
                    autoRigidel.autobuyyes = 0;
                }
                rigiSell();
                Game.computeLumpTimes();
                if (Date.now() - started >= ripeAge) {
                    Game.clickLump();
                }
                // Turn autobuy back on if on before
                if (autoRigidel.autobuyyes == 1) {
                    FrozenCookies.autoBuy = 1;
                }
            }
        case 3: //Rigidel in Jade slot
            if (timeToRipe < 20 && Game.BuildingsOwned % 10) {
                // Turn off autobuy
                if (FrozenCookies.autoBuy == 1) {
                    autoRigidel.autobuyyes = 1;
                    FrozenCookies.autoBuy = 0;
                } else {
                    autoRigidel.autobuyyes = 0;
                }
                rigiSell();
                Game.computeLumpTimes();
                if (Date.now() - started >= ripeAge) {
                    Game.clickLump();
                }
                // Turn autobuy back on if on before
                if (autoRigidel.autobuyyes == 1) {
                    FrozenCookies.autoBuy = 1;
                }
            }
    }
}

function autoTicker() {
    if (Game.TickerEffect && Game.TickerEffect.type == "fortune") {
        Game.tickerL.click();
    }
}

// Used in autoCast() for some maths in the smart Force The Hand of Fate subroutine
function BuffTimeFactor() {
    var DurMod = 1;
    if (Game.Has('Get lucky')) DurMod *= 2;
    if (Game.Has('Lasting fortune')) DurMod *= 1.1;
    if (Game.Has('Lucky digit')) DurMod *= 1.01;
    if (Game.Has('Lucky number')) DurMod *= 1.01;
    if (Game.Has('Green yeast digestives')) DurMod *= 1.01;
    if (Game.Has('Lucky payout')) DurMod *= 1.01;
    DurMod *= 1 + Game.auraMult('Epoch Manipulator') * 0.05;

    if (Game.hasGod) {
        var godLvl = Game.hasGod('decadence');
        if (godLvl == 1) DurMod *= 1.07;
        else if (godLvl == 2) DurMod *= 1.05;
        else if (godLvl == 3) DurMod *= 1.02;
    }

    return DurMod;
}

function autoCast() {
    if (!M) return; // Just leave if you don't have grimoire
    if (M.magic == M.magicM) {
        if (
            FrozenCookies.autoFTHOFCombo == 1 ||
            FrozenCookies.auto100ConsistencyCombo == 1
        ) return; // combo option will override any auto cast function

        if (
            cpsBonus() >= FrozenCookies.minCpSMult ||
            Game.hasBuff("Click frenzy")
        ) {
            switch (FrozenCookies.autoSpell) {
                case 0:
                    return;
                case 1:
                    var CBG = M.spellsById[0];
                    if (M.magicM < Math.floor(CBG.costMin + CBG.costPercent * M.magicM))
                        return;
                    M.castSpell(CBG);
                    logEvent("AutoSpell", "Cast Conjure Baked Goods");
                    return;
                case 2:
                    if (Game.hasBuff("Dragonflight")) return; // DF will remove click frenzy, potentially wasting it

                    var FTHOF = M.spellsById[1];
                    if (M.magicM < Math.floor(FTHOF.costMin + FTHOF.costPercent * M.magicM)) return;

                    // Can we shorten a negative buff?
                    if ((cpsBonus() < 1) && (nextSpellName(0) == "Clot" || nextSpellName(0) == "Ruin Cookies")) {
                        var streT = M.spellsById[2];
                        M.castSpell(streT);
                        logEvent('AutoSpell', 'Cast Stretch Time instead of Force the Hand of Fate');
                    }

                    if (nextSpellName(0) == "Clot" || nextSpellName(0) == "Blab" || nextSpellName(0) == "Cookie Storm (Drop)" || nextSpellName(0) == "Ruin Cookies") {
                        var hagC = M.spellsById[4];
                        M.castSpell(hagC);
                        logEvent('AutoSpell', 'Cast Haggler\'s Charm instead of Force the Hand of Fate');
                    }

                    if (nextSpellName(0) == "Sugar Lump" || nextSpellName(0) == "Cookie Chain") {
                        M.castSpell(FTHOF);
                        logEvent('AutoSpell', 'Cast Force the Hand of Fate');
                    }

                    if (nextSpellName(0) == "Lucky") {
                        if (cpsBonus() >= 7) {
                            M.castSpell(FTHOF);
                            logEvent('AutoSpell', 'Cast Force the Hand of Fate');
                        }
                    }

                    if (nextSpellName(0) == "Elder Frenzy") {
                        if (Game.Upgrades["Elder Pact"].bought == 1) {
                            if (Game.hasBuff('Click frenzy') && Game.hasBuff('Click frenzy').time / 30 >= Math.ceil(6 * BuffTimeFactor()) - 1) {
                                M.castSpell(FTHOF);
                                logEvent('AutoSpell', 'Cast Force the Hand of Fate');
                            }
                        } else if (Game.Upgrades["Elder Pact"].bought == 0) {
                            if (Game.hasBuff('Frenzy') && Game.hasBuff('Click frenzy') && Game.hasBuff('Click frenzy').time / 30 >= Math.ceil(6 * BuffTimeFactor()) - 1) {
                                M.castSpell(FTHOF);
                                logEvent('AutoSpell', 'Cast Force the Hand of Fate');
                            }
                        }
                    }

                    if (nextSpellName(0) == "Frenzy" || nextSpellName(0) == "Building Special") {
                        if (Game.hasBuff('Click frenzy') && Game.hasBuff('Click frenzy').time / 30 >= Math.ceil(13 * BuffTimeFactor()) - 1) {
                            M.castSpell(FTHOF);
                            logEvent('AutoSpell', 'Cast Force the Hand of Fate');
                        }
                    }

                    if (nextSpellName(0) == "Click Frenzy") {
                        if (Game.hasBuff('Frenzy') && BuildingSpecialBuff() == 1 && Game.hasBuff('Frenzy').time / 30 >= Math.ceil(13 * BuffTimeFactor()) - 1 && BuildingBuffTime() >= Math.ceil(13 * BuffTimeFactor())) {
                            M.castSpell(FTHOF);
                            logEvent('AutoSpell', 'Cast Force the Hand of Fate');
                        }
                    }

                    if (nextSpellName(0) == "Cookie Storm") {
                        if (Game.hasBuff('Frenzy') && BuildingSpecialBuff() == 1 && Game.hasBuff('Frenzy').time / 30 >= Math.ceil(7 * BuffTimeFactor()) - 1 && BuildingBuffTime() >= Math.ceil(7 * BuffTimeFactor())) {
                            M.castSpell(FTHOF);
                            logEvent('AutoSpell', 'Cast Force the Hand of Fate');
                        }
                        if (FrozenCookies.autoEaster && !haveAll('easter')) {
                            M.castSpell(FTHOF);
                            logEvent('AutoSpell', 'Cast Force the Hand of Fate');
                        }
                    }

                    if (nextSpellName(0) == "Cursed Finger") {
                        if (Game.hasBuff('Click frenzy') && Game.hasBuff('Click frenzy').time / 30 >= Math.ceil(10 * BuffTimeFactor()) - 1) {
                            M.castSpell(FTHOF);
                            logEvent('AutoSpell', 'Cast Force the Hand of Fate');
                        }
                    }

                    return;
                case 3:
                    var SE = M.spellsById[3];
                    // This code apparently works under the following assumptions:
                    //      - you want to spend your mana to get the highest value building (currently Cortex baker)
                    //      - therefore you'll manually keep your number of Cortex bakers < 400, or don't mind selling the excess for the chance to win a free one
                    // If you don't have any Cortex baker yet, or can't cast SE, just give up.
                    if (
                        Game.Objects["Cortex baker"].amount == 0 ||
                        M.magicM < Math.floor(SE.costMin + SE.costPercent * M.magicM)
                    )
                        return;
                    // If we have over 400 Cortex bakers, always going to sell down to 399.
                    // If you don't have half a Cortex baker's worth of cookies in bank, sell one or more until you do
                    while (
                        Game.Objects["Cortex baker"].amount >= 400 ||
                        Game.cookies < Game.Objects["Cortex baker"].price / 2
                    ) {
                        Game.Objects["Cortex baker"].sell(1);
                        logEvent(
                            "Store",
                            "Sold 1 Cortex baker for " +
                            (Beautify(
                                    Game.Objects["Cortex baker"].price *
                                    Game.Objects["Cortex baker"].getSellMultiplier()
                                ) +
                                " cookies")
                        );
                    }
                    M.castSpell(SE);
                    logEvent("AutoSpell", "Cast Spontaneous Edifice");
                    return;
                case 4:
                    var hagC = M.spellsById[4];
                    if (M.magicM < Math.floor(hagC.costMin + hagC.costPercent * M.magicM))
                        return;
                    M.castSpell(hagC);
                    logEvent("AutoSpell", "Cast Haggler's Charm");
                    return;
            }
        }
    }
}

// Thank goodness for static variables otherwise this function would not have worked as intended.
function autoFTHOFComboAction() {
    // Prereqs check
    if (
        !M || // Just leave if you don't have grimoire
        Game.Objects['Wizard tower'].level > 10 // Will not work with wizard tower level > 10
    ) {
        FrozenCookies.autoFTHOFCombo = 0;
        return;
    }

    // Not currently possible to do the combo
    if (
        FrozenCookies.auto100ConsistencyCombo == 1 || // 100% combo should override
        Game.hasBuff("Dragonflight") // DF will remove click frenzy, potentially wasting it
    ) return;

    if (typeof autoFTHOFComboAction.count == 'undefined') {
        autoFTHOFComboAction.count = Game.Objects['Wizard tower'].amount;
    }

    if (typeof autoFTHOFComboAction.state == 'undefined') {
        autoFTHOFComboAction.state = 0;
    }

    if (autoFTHOFComboAction.state != 2) {
        if (
            (nextSpellName(0) == "Click Frenzy" && nextSpellName(1) == "Building Special") ||
            (nextSpellName(1) == "Click Frenzy" && nextSpellName(0) == "Building Special") ||
            (nextSpellName(0) == "Click Frenzy" && nextSpellName(1) == "Elder Frenzy") ||
            (nextSpellName(1) == "Click Frenzy" && nextSpellName(0) == "Elder Frenzy")
        ) {
            autoFTHOFComboAction.state = 1;
        } else {
            autoFTHOFComboAction.state = 0;
        }
    }

    var SugarLevel = Game.Objects['Wizard tower'].level;
    var FTHOF = M.spellsById[1];

    switch (autoFTHOFComboAction.state) {
        case 0:
            if (M.magic == M.magicM) {
                //Continue casting Haggler's Charm - unless it's something we need right now
                if (nextSpellName(0) == "Sugar Lump") {
                    M.castSpell(FTHOF);
                    logEvent('autoFTHOFCombo', 'Cast Force the Hand of Fate');
                } else if ((nextSpellName(0) == "Clot" || nextSpellName(0) == "Ruin Cookies") && cpsBonus() < 1) {
                    var streT = M.spellsById[2];
                    M.castSpell(streT);
                    logEvent('autoFTHOFCombo', 'Cast Stretch Time instead of Force the Hand of Fate');
                } else if (nextSpellName(0) == "Cookie Storm" && FrozenCookies.autoEaster && !haveAll('easter')) {
                    M.castSpell(FTHOF);
                    logEvent('AutoSpell', 'Cast Force the Hand of Fate');
                } else {
                    var hagC = M.spellsById[4];
                    M.castSpell(hagC);
                    logEvent('autoFTHOFCombo', 'Cast Haggler\'s Charm instead of Force the Hand of Fate');
                }
            }
            return;

        case 1:
            if (
                (Game.hasBuff('Frenzy') || Game.hasBuff('Dragon Harvest')) &&
                BuildingSpecialBuff() == 1 &&
                (Game.hasBuff('Frenzy').time / 30 >= Math.ceil(13 * BuffTimeFactor()) - 1 ||
                    Game.hasBuff('Dragon Harvest').time / 30 >= Math.ceil(13 * BuffTimeFactor()) - 1) &&
                BuildingBuffTime() >= Math.ceil(13 * BuffTimeFactor())
            ) {
                // Turn off auto buy
                if (FrozenCookies.autoBuy == 1) {
                    autoFTHOFComboAction.autobuyyes = 1;
                    FrozenCookies.autoBuy = 0;
                } else {
                    autoFTHOFComboAction.autobuyyes = 0;
                }

                switch (SugarLevel) {
                    case 0:
                        return;

                        // Calculated with https://lookas123.github.io/CCGrimoireCalculator/
                    case 1:
                        if (M.magicM >= 81 && M.magic == M.magicM) {
                            M.castSpell(FTHOF);
                            logEvent('autoFTHOFCombo', 'Cast first Force the Hand of Fate');

                            autoFTHOFComboAction.count = Game.Objects['Wizard tower'].amount - 21;
                            Game.Objects['Wizard tower'].sell(autoFTHOFComboAction.count);

                            autoFTHOFComboAction.state = 2;
                        }
                        return;

                    case 2:
                        if (M.magicM >= 81 && M.magic == M.magicM) {
                            M.castSpell(FTHOF);
                            logEvent('autoFTHOFCombo', 'Cast first Force the Hand of Fate');

                            autoFTHOFComboAction.count = Game.Objects['Wizard tower'].amount - 14;
                            Game.Objects['Wizard tower'].sell(autoFTHOFComboAction.count);

                            autoFTHOFComboAction.state = 2;
                        }
                        return;

                    case 3:
                        if (M.magicM >= 81 && M.magic == M.magicM) {
                            M.castSpell(FTHOF);
                            logEvent('autoFTHOFCombo', 'Cast first Force the Hand of Fate');

                            autoFTHOFComboAction.count = Game.Objects['Wizard tower'].amount - 8;
                            Game.Objects['Wizard tower'].sell(autoFTHOFComboAction.count);

                            autoFTHOFComboAction.state = 2;
                        }
                        return;

                    case 4:
                        if (M.magicM >= 81 && M.magic == M.magicM) {
                            M.castSpell(FTHOF);
                            logEvent('autoFTHOFCombo', 'Cast first Force the Hand of Fate');

                            autoFTHOFComboAction.count = Game.Objects['Wizard tower'].amount - 3;
                            Game.Objects['Wizard tower'].sell(autoFTHOFComboAction.count);

                            autoFTHOFComboAction.state = 2;
                        }
                        return;

                    case 5:
                        if (M.magicM >= 83 && M.magic == M.magicM) {
                            M.castSpell(FTHOF);
                            logEvent('autoFTHOFCombo', 'Cast first Force the Hand of Fate');

                            autoFTHOFComboAction.count = Game.Objects['Wizard tower'].amount - 1;
                            Game.Objects['Wizard tower'].sell(autoFTHOFComboAction.count);

                            autoFTHOFComboAction.state = 2;
                        }
                        return;

                    case 6:
                        if (M.magicM >= 88 && M.magic == M.magicM) {
                            M.castSpell(FTHOF);
                            logEvent('autoFTHOFCombo', 'Cast first Force the Hand of Fate');

                            autoFTHOFComboAction.count = Game.Objects['Wizard tower'].amount - 1;
                            Game.Objects['Wizard tower'].sell(autoFTHOFComboAction.count);

                            autoFTHOFComboAction.state = 2;
                        }
                        return;

                    case 7:
                        if (M.magicM >= 91 && M.magic == M.magicM) {
                            M.castSpell(FTHOF);
                            logEvent('autoFTHOFCombo', 'Cast first Force the Hand of Fate');

                            autoFTHOFComboAction.count = Game.Objects['Wizard tower'].amount - 1;
                            Game.Objects['Wizard tower'].sell(autoFTHOFComboAction.count);

                            autoFTHOFComboAction.state = 2;
                        }
                        return;

                    case 8:
                        if (M.magicM >= 93 && M.magic == M.magicM) {
                            M.castSpell(FTHOF);
                            logEvent('autoFTHOFCombo', 'Cast first Force the Hand of Fate');

                            autoFTHOFComboAction.count = Game.Objects['Wizard tower'].amount - 1;
                            Game.Objects['Wizard tower'].sell(autoFTHOFComboAction.count);

                            autoFTHOFComboAction.state = 2;
                        }
                        return;

                    case 9:
                        if (M.magicM >= 96 && M.magic == M.magicM) {
                            M.castSpell(FTHOF);
                            logEvent('autoFTHOFCombo', 'Cast first Force the Hand of Fate');

                            autoFTHOFComboAction.count = Game.Objects['Wizard tower'].amount - 1;
                            Game.Objects['Wizard tower'].sell(autoFTHOFComboAction.count);

                            autoFTHOFComboAction.state = 2;
                        }
                        return;

                    case 10:
                        if (M.magicM >= 98 && M.magic == M.magicM) {
                            M.castSpell(FTHOF);
                            logEvent('autoFTHOFCombo', 'Cast first Force the Hand of Fate');

                            autoFTHOFComboAction.count = Game.Objects['Wizard tower'].amount - 1;
                            Game.Objects['Wizard tower'].sell(autoFTHOFComboAction.count);

                            autoFTHOFComboAction.state = 2;
                        }
                        return;
                }
            }
            return;

        case 2:
            M.computeMagicM(); //Recalc max after selling

            M.castSpell(FTHOF);
            logEvent('autoFTHOFCombo', 'Double cast Force the Hand of Fate');

            safeBuy(Game.Objects["Wizard tower"], autoFTHOFComboAction.count);

            // Turn autobuy back on if on before
            if (autoFTHOFComboAction.autobuyyes == 1) {
                FrozenCookies.autoBuy = 1;
            }

            autoFTHOFComboAction.count = Game.Objects['Wizard tower'].amount;

            autoFTHOFComboAction.state = 0;
    }
}

function auto100ConsistencyComboAction() {
    // Prereqs check
    if (
        !M || // Just leave if you don't have grimoire
        Game.Objects['Wizard tower'].level < 10 || // Only works with wizard towers level 10
        !G // Garden must exist
    ) {
        FrozenCookies.auto100ConsistencyCombo = 0;
        return;
    }

    // Not currently possible to do the combo
    if (
        Game.hasBuff("Dragonflight") || // DF will remove click frenzy, potentially wasting it
        Game.lumps < 1 || // Needs at least 1 lump
        Game.dragonLevel < 26 || // Fully upgraded dragon needed for two auras
        !(Game.hasAura('Reaper of Fields') || Game.hasAura('Reality Bending')) || // Will only work if Dragon Harvest is possible
        (!(Game.hasGod("mother") || T.swaps < 1)) ||
        (!(Game.hasGod("ruin") || T.swaps < 1)) ||
        (!Game.hasGod("mother") && !Game.hasGod("ruin") && T.swaps < 2) || // Need to have Moka and Godz or enough swaps
        G.plants['whiskerbloom'].id.unlocked != 1 // Whiskerbloom must be unlocked
    ) {
        return;
    }

    if (typeof auto100ConsistencyComboAction.countFarm == 'undefined') {
        auto100ConsistencyComboAction.countFarm = Game.Objects['Farm'].amount;
    }

    if (typeof auto100ConsistencyComboAction.countMine == 'undefined') {
        auto100ConsistencyComboAction.countMine = Game.Objects['Mine'].amount;
    }

    if (typeof auto100ConsistencyComboAction.countFactory == 'undefined') {
        auto100ConsistencyComboAction.countFactory = Game.Objects['Factory'].amount;
    }

    if (typeof auto100ConsistencyComboAction.countBank == 'undefined') {
        auto100ConsistencyComboAction.countBank = Game.Objects['Bank'].amount;
    }

    if (typeof auto100ConsistencyComboAction.countTemple == 'undefined') {
        auto100ConsistencyComboAction.countTemple = Game.Objects['Temple'].amount;
    }

    if (typeof auto100ConsistencyComboAction.countWizard == 'undefined') {
        auto100ConsistencyComboAction.countWizard = Game.Objects['Wizard tower'].amount;
    }

    if (typeof auto100ConsistencyComboAction.countShipment == 'undefined') {
        auto100ConsistencyComboAction.countShipment = Game.Objects['Shipment'].amount;
    }

    if (typeof auto100ConsistencyComboAction.countAlchemy == 'undefined') {
        auto100ConsistencyComboAction.countAlchemy = Game.Objects['Alchemy lab'].amount;
    }

    if (typeof auto100ConsistencyComboAction.countTimeMach == 'undefined') {
        auto100ConsistencyComboAction.countTimeMach = Game.Objects['Time machine'].amount;
    }

    if (typeof auto100ConsistencyComboAction.countAntiMatter == 'undefined') {
        auto100ConsistencyComboAction.countAntiMatter = Game.Objects['Antimatter condenser'].amount;
    }

    if (typeof auto100ConsistencyComboAction.state == 'undefined') {
        auto100ConsistencyComboAction.state = 0;
    }

    if (auto100ConsistencyComboAction.state == 0) {
        if (
            (nextSpellName(0) == "Click Frenzy" && nextSpellName(1) == "Building Special") ||
            (nextSpellName(1) == "Click Frenzy" && nextSpellName(0) == "Building Special") ||
            (nextSpellName(0) == "Click Frenzy" && nextSpellName(1) == "Elder Frenzy") ||
            (nextSpellName(1) == "Click Frenzy" && nextSpellName(0) == "Elder Frenzy")
        ) {
            auto100ConsistencyComboAction.state = 1;
        }
    }

    var FTHOF = M.spellsById[1];

    switch (auto100ConsistencyComboAction.state) {
        case 0:
            //Continue casting Haggler's Charm - unless it's something we need right now
            if (M.magic == M.magicM) {
                if (nextSpellName(0) == "Sugar Lump") {
                    M.castSpell(FTHOF);
                    logEvent('auto100ConsistencyCombo', 'Cast Force the Hand of Fate');
                } else if ((nextSpellName(0) == "Clot" || nextSpellName(0) == "Ruin Cookies") && cpsBonus() < 1) {
                    var streT = M.spellsById[2];
                    M.castSpell(streT);
                    logEvent('auto100ConsistencyCombo', 'Cast Stretch Time instead of Force the Hand of Fate');
                } else if (nextSpellName(0) == "Cookie Storm" && FrozenCookies.autoEaster && !haveAll('easter')) {
                    M.castSpell(FTHOF);
                    logEvent('auto100ConsistencyCombo', 'Cast Force the Hand of Fate');
                } else {
                    var hagC = M.spellsById[4];
                    M.castSpell(hagC);
                    logEvent('auto100ConsistencyCombo', 'Cast Haggler\'s Charm instead of Force the Hand of Fate');
                }
            }

            return;

        case 1:
            if (
                Game.hasBuff('Frenzy') &&
                Game.hasBuff('Dragon Harvest') &&
                BuildingSpecialBuff() == 1 &&
                Game.hasBuff('Frenzy').time / 30 >= Math.ceil(13 * BuffTimeFactor()) - 1 &&
                Game.hasBuff('Dragon Harvest').time / 30 >= Math.ceil(13 * BuffTimeFactor()) - 1 &&
                BuildingBuffTime() >= Math.ceil(13 * BuffTimeFactor())
            ) {
                // Turn off auto buy and make sure we're not in sell mode
                if (FrozenCookies.autoBuy == 1) {
                    auto100ConsistencyComboAction.autobuyyes = 1;
                    FrozenCookies.autoBuy = 0;
                } else {
                    auto100ConsistencyComboAction.autobuyyes = 0;
                }
                if (Game.buyMode == -1) {
                    Game.buyMode = 1;
                }
                logEvent('auto100ConsistencyCombo', 'Starting auto100ConsistencyCombo');

                auto100ConsistencyComboAction.state = 2;
            }

            return;

        case 2: // Turn off auto click golden cookie
            if (FrozenCookies.autoGC > 0) {
                auto100ConsistencyComboAction.autogcyes = 1;
            } else {
                auto100ConsistencyComboAction.autogcyes = 0;
            }

            FrozenCookies.autoGC = 0;

            auto100ConsistencyComboAction.state = 3;

            return;

        case 3: // Harvest garden then plant whiskerbloom
            G.harvestAll();

            for (var y = 0; y <= 5; y++) {
                for (var x = 0; x <= 5; x++) {
                    G.seedSelected = G.plants['whiskerbloom'].id;
                    G.clickTile(x, y);
                }
            }

            auto100ConsistencyComboAction.state = 4;

            return;

        case 4: // Register current dragon harvest aura then set auras to radiant appetite and dragon's fortune
            if (Game.hasAura('Reaper of Fields')) {
                auto100ConsistencyComboAction.oldaura = 4
            } else if (Game.hasAura('Reality Bending')) {
                auto100ConsistencyComboAction.oldaura = 18
            }

            if (!Game.hasAura("Dragon\'s Fortune")) {
                Game.SetDragonAura(16, 1);
                Game.ConfirmPrompt();
            }
            if (!Game.hasAura("Radiant Appetite")) {
                Game.SetDragonAura(15, 0);
                Game.ConfirmPrompt();
            }

            auto100ConsistencyComboAction.state = 5;

            return;

        case 5: // Cast FTHOF then sell
            auto100ConsistencyComboAction.count = Game.Objects['Wizard tower'].amount - 1;
            M.castSpell(FTHOF);
            logEvent('auto100ConsistencyCombo', 'Cast first Force the Hand of Fate');

            Game.Objects['Wizard tower'].sell(auto100ConsistencyComboAction.count);
            auto100ConsistencyComboAction.state = 6;

            return;

        case 6: // Cast FTHOF then buy
            M.computeMagicM(); //Recalc max after selling
            M.castSpell(FTHOF);
            logEvent('auto100ConsistencyCombo', 'Cast second Force the Hand of Fate');

            Game.Objects['Wizard tower'].buy(auto100ConsistencyComboAction.count);
            auto100ConsistencyComboAction.count = Game.Objects['Wizard tower'].amount;

            auto100ConsistencyComboAction.state = 7;
            return;

        case 7: // Use sugar lump to refill magic
            Game.Objects['Wizard tower'].minigame.lumpRefill.click();

            auto100ConsistencyComboAction.state = 8;

            return;

        case 8: // Cast FTHOF then sell
            auto100ConsistencyComboAction.count = Game.Objects['Wizard tower'].amount - 1;
            M.castSpell(FTHOF);
            logEvent('auto100ConsistencyCombo', 'Cast third Force the Hand of Fate');

            Game.Objects['Wizard tower'].sell(auto100ConsistencyComboAction.count);

            auto100ConsistencyComboAction.state = 9;

            return;

        case 9: // Cast FTHOF then buy
            M.computeMagicM(); //Recalc max after selling
            M.castSpell(FTHOF);
            logEvent('auto100ConsistencyCombo', 'Cast fourth Force the Hand of Fate');

            Game.Objects['Wizard tower'].buy(auto100ConsistencyComboAction.count);
            auto100ConsistencyComboAction.count = Game.Objects['Wizard tower'].amount;

            auto100ConsistencyComboAction.state = 10;

            return;

        case 10: // Take Stock Market loans
            if (B) {
                Game.Objects['Bank'].minigame.takeLoan(1);
                Game.Objects['Bank'].minigame.takeLoan(2);
                Game.Objects['Bank'].minigame.takeLoan(3);
            }

            auto100ConsistencyComboAction.state = 11;

            return;

        case 11: // If autoGodzamok is on, disable
            if (FrozenCookies.autoGodzamok > 0) {
                auto100ConsistencyComboAction.autogodyes = 1;
            } else {
                auto100ConsistencyComboAction.autogodyes = 0;
            }
            FrozenCookies.autoGodzamok = 0;

            auto100ConsistencyComboAction.state = 12;

            return;


        case 12: // Activate Building Special and Click Frenzy buffs
            Game.shimmers[0].pop();
            Game.shimmers[0].pop();

            auto100ConsistencyComboAction.state = 13;

            return;

        case 13: // sell buildings
            Game.Objects['Farm'].sell(auto100ConsistencyComboAction.countFarm - 1);
            Game.Objects['Mine'].sell(auto100ConsistencyComboAction.countMine);
            Game.Objects['Factory'].sell(auto100ConsistencyComboAction.countFactory);
            Game.Objects['Bank'].sell(auto100ConsistencyComboAction.countBank);
            Game.Objects['Temple'].sell(auto100ConsistencyComboAction.countTemple - 1);
            Game.Objects['Wizard tower'].sell(auto100ConsistencyComboAction.countWizard - 1);
            Game.Objects['Shipment'].sell(auto100ConsistencyComboAction.countShipment);
            Game.Objects['Alchemy lab'].sell(auto100ConsistencyComboAction.countAlchemy);
            Game.Objects['Time machine'].sell(auto100ConsistencyComboAction.countTimeMach);
            Game.Objects['Antimatter condenser'].sell(auto100ConsistencyComboAction.countAntiMatter);

            auto100ConsistencyComboAction.state = 14;

            return;

        case 14: // Swap Mokalsium to ruby slot
            if (!Game.hasGod("mother") && T.swaps >= 1) {
                swapIn(8, 1);
            }

            auto100ConsistencyComboAction.state = 15;

            return;

        case 15: // buy back buildings
            Game.Objects['Farm'].buy(auto100ConsistencyComboAction.countFarm - 1);
            Game.Objects['Mine'].buy(auto100ConsistencyComboAction.countMine);
            Game.Objects['Factory'].buy(auto100ConsistencyComboAction.countFactory);
            Game.Objects['Bank'].buy(auto100ConsistencyComboAction.countBank);
            Game.Objects['Temple'].buy(auto100ConsistencyComboAction.countTemple - 1);
            Game.Objects['Wizard tower'].buy(auto100ConsistencyComboAction.countWizard - 1);
            Game.Objects['Shipment'].buy(auto100ConsistencyComboAction.countShipment);
            Game.Objects['Alchemy lab'].buy(auto100ConsistencyComboAction.countAlchemy);
            Game.Objects['Time machine'].buy(auto100ConsistencyComboAction.countTimeMach);
            Game.Objects['Antimatter condenser'].buy(auto100ConsistencyComboAction.countAntiMatter);

            auto100ConsistencyComboAction.state = 16;

            return;

        case 16: // Put Godz in diamond and perform custom autogodzamok
            if (!Game.hasGod("ruin") && T.swaps >= 1) {
                swapIn(2, 0);
            }
            if (!Game.hasBuff('Devastation') && hasClickBuff()) {
                if (Game.Objects['Farm'].amount >= 10) {
                    Game.Objects['Farm'].sell(auto100ConsistencyComboAction.countFarm - 1);
                    Game.Objects['Mine'].sell(auto100ConsistencyComboAction.countMine);
                    Game.Objects['Factory'].sell(auto100ConsistencyComboAction.countFactory);
                    Game.Objects['Bank'].sell(auto100ConsistencyComboAction.countBank);
                    Game.Objects['Temple'].sell(auto100ConsistencyComboAction.countTemple - 1);
                    Game.Objects['Wizard tower'].sell(auto100ConsistencyComboAction.countWizard - 1);
                    Game.Objects['Shipment'].sell(auto100ConsistencyComboAction.countShipment);
                    Game.Objects['Alchemy lab'].sell(auto100ConsistencyComboAction.countAlchemy);
                    Game.Objects['Time machine'].sell(auto100ConsistencyComboAction.countTimeMach);
                    Game.Objects['Antimatter condenser'].sell(auto100ConsistencyComboAction.countAntiMatter);
                }
                if (Game.Objects['Farm'].amount < 10) {
                    Game.Objects['Farm'].buy(auto100ConsistencyComboAction.countFarm - 1);
                    Game.Objects['Mine'].buy(auto100ConsistencyComboAction.countMine);
                    Game.Objects['Factory'].buy(auto100ConsistencyComboAction.countFactory);
                    Game.Objects['Bank'].buy(auto100ConsistencyComboAction.countBank);
                    Game.Objects['Temple'].buy(auto100ConsistencyComboAction.countTemple - 1);
                    Game.Objects['Wizard tower'].buy(auto100ConsistencyComboAction.countWizard - 1);
                    Game.Objects['Shipment'].buy(auto100ConsistencyComboAction.countShipment);
                    Game.Objects['Alchemy lab'].buy(auto100ConsistencyComboAction.countAlchemy);
                    Game.Objects['Time machine'].buy(auto100ConsistencyComboAction.countTimeMach);
                    Game.Objects['Antimatter condenser'].buy(auto100ConsistencyComboAction.countAntiMatter);
                }
            }

            if (!hasClickBuff()) {
                auto100ConsistencyComboAction.state = 17;
            }

            return;

        case 17: // Turn autobuy back on if on before
            if (auto100ConsistencyComboAction.autobuyyes == 1) {
                FrozenCookies.autoBuy = 1;
            }

            auto100ConsistencyComboAction.state = 18;

            return;

        case 18: // Once click frenzy buff is gone, turn autoGC on if it were on previously
            if (!Game.hasBuff('Click frenzy')) {
                if (auto100ConsistencyComboAction.autogcyes == 1) {
                    FrozenCookies.autoGC = 1;
                }

                auto100ConsistencyComboAction.state = 19;
            }

            return;

        case 19: // Re-enable autoGodzamok if it were on previously
            if (auto100ConsistencyComboAction.autogodyes == 1) {
                FrozenCookies.autoGodzamok = 1;
            }

            auto100ConsistencyComboAction.state = 20;

            return;

        case 20: // Re-set Reaper of Fields or Reality Bending as the second dragon aura
            if (auto100ConsistencyComboAction.oldaura == 4) {
                Game.SetDragonAura(4, 1);
                Game.ConfirmPrompt();
            } else if (auto100ConsistencyComboAction.oldaura == 18) {
                Game.SetDragonAura(18, 1);
                Game.ConfirmPrompt();
            }
            logEvent('auto100ConsistencyCombo', 'Completed auto100ConsistencyCombo');

            auto100ConsistencyComboAction.state = 0;

            return;
    }

}

function autoEasterAction() {

    if (FrozenCookies.autoEaster == 0) {
        return;
    }

    if (Game.hasBuff('Cookie storm') && !haveAll('easter') && Game.season != 'easter') {
        Game.UpgradesById[209].buy()
        logEvent("autoEaster", "Swapping to Easter for Cookie Storm");
    }
}

function autoHalloweenAction() {

    if (FrozenCookies.autoHalloween == 0) {
        return;
    }
    var living = liveWrinklers();
    if (living.length > 0) {
        if (Game.season != 'easter' && Game.season != 'halloween' && !haveAll('halloween')) {
            Game.UpgradesById[183].buy()
            logEvent("autoHalloween", "Swapping to Halloween season to use wrinklers");
        }
    }
}

function autoBlacklistOff() {
    switch (FrozenCookies.blacklist) {
        case 1:
            FrozenCookies.blacklist = Game.cookiesEarned >= 1000000 ? 0 : 1;
            break;
        case 2:
            FrozenCookies.blacklist = Game.cookiesEarned >= 1000000000 ? 0 : 2;
            break;
        case 3:
            FrozenCookies.blacklist =
                haveAll("halloween") && haveAll("easter") ? 0 : 3;
            break;
    }
}

function autoBrokerAction() {

    if (!B) { // Just leave if you don't have the bank
        return;
    }
    if (hasClickBuff()) { // Don't buy during click buff
        return;
    }

    //Hire brokers
    var delay = delayAmount();
    if (B.brokers < B.getMaxBrokers() && Game.cookies >= (delay + B.getBrokerPrice())) {
        l('bankBrokersBuy').click();
        logEvent("AutoBroker", "Bought a broker for " + Beautify(B.getBrokerPrice()) + " cookies");
    }
    //Upgrade bank level
    var countCursor = Game.Objects["Cursor"].amount;
    let currentOffice = B.offices[B.officeLevel];
    if (
        currentOffice.cost &&
        Game.Objects['Cursor'].amount >= currentOffice.cost[0] &&
        Game.Objects['Cursor'].level >= currentOffice.cost[1]
    ) {
        l('bankOfficeUpgrade').click();
        logEvent("AutoBroker", "Upgrade bank level");
        safeBuy(Game.Objects["Cursor"], countCursor);
        logEvent("AutoBroker", "Bought " + countCursor + " cursors");
    }
}

function autoDragonAction() {

    if (!(Game.HasUnlocked("A crumbly egg"))) {
        return;
    }
    if (hasClickBuff()) { // Don't buy during click buff
        return;
    }

    if (Game.HasUnlocked("A crumbly egg") && !Game.Has("A crumbly egg")) {
        Game.Upgrades["A crumbly egg"].buy();
        logEvent("autoDragon", "Bought an egg");
    }

    if (Game.dragonLevel < Game.dragonLevels.length - 1 && Game.dragonLevels[Game.dragonLevel].cost()) {
        PlaySound('snd/shimmerClick.mp3');
        Game.dragonLevels[Game.dragonLevel].buy();
        Game.dragonLevel = (Game.dragonLevel + 1) % Game.dragonLevels.length;

        if (Game.dragonLevel >= Game.dragonLevels.length - 1) Game.Win('Here be dragon');
        Game.recalculateGains = 1;
        Game.upgradesToRebuild = 1;
        logEvent("autoDragon", "Upgraded the dragon");
    }
}

function petDragonAction() {

    if (Game.dragonLevel < 4 || !(Game.Has("Pet the dragon"))) { //Need to actually be able to pet
        return;
    }
    if (hasClickBuff()) { // Don't pet during click buff
        return;
    }

    //Calculate current pet drop and if we have it
    Math.seedrandom(Game.seed + '/dragonTime');
    let drops = ['Dragon scale', 'Dragon claw', 'Dragon fang', 'Dragon teddy bear'];
    drops = shuffle(drops);
    Math.seedrandom();
    let currentDrop = drops[Math.floor((new Date().getMinutes() / 60) * drops.length)];

    //Pet the dragon
    if (!Game.Has(currentDrop) && !Game.HasUnlocked(currentDrop)) {
        Game.specialTab = "dragon";
        Game.ClickSpecialPic();
        logEvent("petDragon", "Who's a good dragon? You are!");
    }
}

function autoLoanBuy() {
    if (!B) { // Just leave if you don't have the bank
        return;
    }

    if (hasClickBuff() && (cpsBonus() >= FrozenCookies.minLoanMult)) {
        Game.Objects['Bank'].minigame.takeLoan(1);
        Game.Objects['Bank'].minigame.takeLoan(2);
        // Game.Objects['Bank'].minigame.takeLoan(3);
    }
}

function generateProbabilities(upgradeMult, minBase, maxMult) {
    var cumProb = [];
    var remainingProbability = 1;
    var minTime = minBase * upgradeMult;
    var maxTime = maxMult * minTime;
    var spanTime = maxTime - minTime;
    for (var i = 0; i < maxTime; i++) {
        var thisFrame =
            remainingProbability * Math.pow(Math.max(0, (i - minTime) / spanTime), 5);
        remainingProbability -= thisFrame;
        cumProb.push(1 - remainingProbability);
    }
    return cumProb;
}

var cumulativeProbabilityList = {
    golden: [1, 0.95, 0.5, 0.475, 0.25, 0.2375].reduce(function(r, x) {
        r[x] = generateProbabilities(x, 5 * 60 * Game.fps, 3);
        return r;
    }, {}),
    reindeer: [1, 0.5].reduce(function(r, x) {
        r[x] = generateProbabilities(x, 3 * 60 * Game.fps, 2);
        return r;
    }, {}),
};

function getProbabilityList(listType) {
    return cumulativeProbabilityList[listType][getProbabilityModifiers(listType)];
}

function getProbabilityModifiers(listType) {
    var result;
    switch (listType) {
        case "golden":
            result =
                (Game.Has("Lucky day") ? 0.5 : 1) *
                (Game.Has("Serendipity") ? 0.5 : 1) *
                (Game.Has("Golden goose egg") ? 0.95 : 1);
            break;
        case "reindeer":
            result = Game.Has("Reindeer baking grounds") ? 0.5 : 1;
            break;
    }
    return result;
}

function cumulativeProbability(listType, start, stop) {
    return (
        1 -
        (1 - getProbabilityList(listType)[stop]) /
        (1 - getProbabilityList(listType)[start])
    );
}

function probabilitySpan(listType, start, endProbability) {
    var startProbability = getProbabilityList(listType)[start];
    return _.sortedIndex(
        getProbabilityList(listType),
        startProbability + endProbability - startProbability * endProbability
    );
}

function clickBuffBonus() {
    var ret = 1;
    for (var i in Game.buffs) {
        // Devastation, Godzamok's buff, is too variable
        if (
            typeof Game.buffs[i].multClick != "undefined" &&
            Game.buffs[i].name != "Devastation"
        ) {
            ret *= Game.buffs[i].multClick;
        }
    }
    return ret;
}

function cpsBonus() {
    var ret = 1;
    for (var i in Game.buffs) {
        if (typeof Game.buffs[i].multCpS != "undefined") {
            ret *= Game.buffs[i].multCpS;
        }
    }
    return ret;
}

function hasClickBuff() {
    return Game.hasBuff("Cursed finger") || clickBuffBonus() > 1;
}

function baseCps() {
    var buffMod = 1;
    for (var i in Game.buffs) {
        if (typeof Game.buffs[i].multCpS != "undefined")
            buffMod *= Game.buffs[i].multCpS;
    }
    if (buffMod === 0) {
        return FrozenCookies.lastBaseCPS;
    }
    var baseCPS = Game.cookiesPs / buffMod;
    FrozenCookies.lastBaseCPS = baseCPS;
    return baseCPS;
}

function baseClickingCps(clickSpeed) {
    var clickFrenzyMod = clickBuffBonus();
    var frenzyMod = Game.hasBuff("Frenzy") ? Game.buffs["Frenzy"].multCpS : 1;
    var cpc = Game.mouseCps() / (clickFrenzyMod * frenzyMod);
    return clickSpeed * cpc;
}

function effectiveCps(delay, wrathValue, wrinklerCount) {
    wrathValue = wrathValue != null ? wrathValue : Game.elderWrath;
    wrinklerCount = wrinklerCount != null ? wrinklerCount : wrathValue ? 10 : 0;
    var wrinkler = wrinklerMod(wrinklerCount);
    if (delay == null) {
        delay = delayAmount();
    }
    return (
        baseCps() * wrinkler +
        gcPs(cookieValue(delay, wrathValue, wrinklerCount)) +
        baseClickingCps(FrozenCookies.cookieClickSpeed * FrozenCookies.autoClick) +
        reindeerCps(wrathValue)
    );
}

function frenzyProbability(wrathValue) {
    wrathValue = wrathValue != null ? wrathValue : Game.elderWrath;
    return cookieInfo.frenzy.odds[wrathValue]; // + cookieInfo.frenzyRuin.odds[wrathValue] + cookieInfo.frenzyLucky.odds[wrathValue] + cookieInfo.frenzyClick.odds[wrathValue];
}

function clotProbability(wrathValue) {
    wrathValue = wrathValue != null ? wrathValue : Game.elderWrath;
    return cookieInfo.clot.odds[wrathValue]; // + cookieInfo.clotRuin.odds[wrathValue] + cookieInfo.clotLucky.odds[wrathValue] + cookieInfo.clotClick.odds[wrathValue];
}

function bloodProbability(wrathValue) {
    wrathValue = wrathValue != null ? wrathValue : Game.elderWrath;
    return cookieInfo.blood.odds[wrathValue];
}

function cookieValue(bankAmount, wrathValue, wrinklerCount) {
    var cps = baseCps();
    var clickCps = baseClickingCps(
        FrozenCookies.autoClick * FrozenCookies.cookieClickSpeed
    );
    var frenzyCps = FrozenCookies.autoFrenzy ?
        baseClickingCps(FrozenCookies.autoFrenzy * FrozenCookies.frenzyClickSpeed) :
        clickCps;
    var luckyMod = Game.Has("Get lucky") ? 2 : 1;
    wrathValue = wrathValue != null ? wrathValue : Game.elderWrath;
    wrinklerCount = wrinklerCount != null ? wrinklerCount : wrathValue ? 10 : 0;
    var wrinkler = wrinklerMod(wrinklerCount);

    var value = 0;
    // Clot
    value -=
        cookieInfo.clot.odds[wrathValue] *
        (wrinkler * cps + clickCps) *
        luckyMod *
        66 *
        0.5;
    // Frenzy
    value +=
        cookieInfo.frenzy.odds[wrathValue] *
        (wrinkler * cps + clickCps) *
        luckyMod *
        77 *
        6;
    // Blood
    value +=
        cookieInfo.blood.odds[wrathValue] *
        (wrinkler * cps + clickCps) *
        luckyMod *
        6 *
        665;
    // Chain
    value +=
        cookieInfo.chain.odds[wrathValue] *
        calculateChainValue(bankAmount, cps, 7 - wrathValue / 3);
    // Ruin
    value -=
        cookieInfo.ruin.odds[wrathValue] *
        (Math.min(bankAmount * 0.05, cps * 60 * 10) + 13);
    // Frenzy + Ruin
    value -=
        cookieInfo.frenzyRuin.odds[wrathValue] *
        (Math.min(bankAmount * 0.05, cps * 60 * 10 * 7) + 13);
    // Clot + Ruin
    value -=
        cookieInfo.clotRuin.odds[wrathValue] *
        (Math.min(bankAmount * 0.05, cps * 60 * 10 * 0.5) + 13);
    // Lucky
    value +=
        cookieInfo.lucky.odds[wrathValue] *
        (Math.min(bankAmount * 0.15, cps * 60 * 15) + 13);
    // Frenzy + Lucky
    value +=
        cookieInfo.frenzyLucky.odds[wrathValue] *
        (Math.min(bankAmount * 0.15, cps * 60 * 15 * 7) + 13);
    // Clot + Lucky
    value +=
        cookieInfo.clotLucky.odds[wrathValue] *
        (Math.min(bankAmount * 0.15, cps * 60 * 15 * 0.5) + 13);
    // Click
    value += cookieInfo.click.odds[wrathValue] * frenzyCps * luckyMod * 13 * 777;
    // Frenzy + Click
    value +=
        cookieInfo.frenzyClick.odds[wrathValue] *
        frenzyCps *
        luckyMod *
        13 *
        777 *
        7;
    // Clot + Click
    value +=
        cookieInfo.clotClick.odds[wrathValue] *
        frenzyCps *
        luckyMod *
        13 *
        777 *
        0.5;
    // Blah
    value += 0;
    return value;
}

function cookieStats(bankAmount, wrathValue, wrinklerCount) {
    var cps = baseCps();
    var clickCps = baseClickingCps(
        FrozenCookies.autoClick * FrozenCookies.cookieClickSpeed
    );
    var frenzyCps = FrozenCookies.autoFrenzy ?
        baseClickingCps(FrozenCookies.autoFrenzy * FrozenCookies.frenzyClickSpeed) :
        clickCps;
    var luckyMod = Game.Has("Get lucky") ? 2 : 1;
    var clickFrenzyMod = clickBuffBonus();
    wrathValue = wrathValue != null ? wrathValue : Game.elderWrath;
    wrinklerCount = wrinklerCount != null ? wrinklerCount : wrathValue ? 10 : 0;
    var wrinkler = wrinklerMod(wrinklerCount);

    var result = {};
    // Clot
    result.clot = -1 *
        cookieInfo.clot.odds[wrathValue] *
        (wrinkler * cps + clickCps) *
        luckyMod *
        66 *
        0.5;
    // Frenzy
    result.frenzy =
        cookieInfo.frenzy.odds[wrathValue] *
        (wrinkler * cps + clickCps) *
        luckyMod *
        77 *
        7;
    // Blood
    result.blood =
        cookieInfo.blood.odds[wrathValue] *
        (wrinkler * cps + clickCps) *
        luckyMod *
        666 *
        6;
    // Chain
    result.chain =
        cookieInfo.chain.odds[wrathValue] *
        calculateChainValue(bankAmount, cps, 7 - wrathValue / 3);
    // Ruin
    result.ruin = -1 *
        cookieInfo.ruin.odds[wrathValue] *
        (Math.min(bankAmount * 0.05, cps * 60 * 10) + 13);
    // Frenzy + Ruin
    result.frenzyRuin = -1 *
        cookieInfo.frenzyRuin.odds[wrathValue] *
        (Math.min(bankAmount * 0.05, cps * 60 * 10 * 7) + 13);
    // Clot + Ruin
    result.clotRuin = -1 *
        cookieInfo.clotRuin.odds[wrathValue] *
        (Math.min(bankAmount * 0.05, cps * 60 * 10 * 0.5) + 13);
    // Lucky
    result.lucky =
        cookieInfo.lucky.odds[wrathValue] *
        (Math.min(bankAmount * 0.15, cps * 60 * 15) + 13);
    // Frenzy + Lucky
    result.frenzyLucky =
        cookieInfo.frenzyLucky.odds[wrathValue] *
        (Math.min(bankAmount * 0.15, cps * 60 * 15 * 7) + 13);
    // Clot + Lucky
    result.clotLucky =
        cookieInfo.clotLucky.odds[wrathValue] *
        (Math.min(bankAmount * 0.15, cps * 60 * 15 * 0.5) + 13);
    // Click
    result.click =
        cookieInfo.click.odds[wrathValue] * frenzyCps * luckyMod * 13 * 777;
    // Frenzy + Click
    result.frenzyClick =
        cookieInfo.frenzyClick.odds[wrathValue] *
        frenzyCps *
        luckyMod *
        13 *
        777 *
        7;
    // Clot + Click
    result.clotClick =
        cookieInfo.clotClick.odds[wrathValue] *
        frenzyCps *
        luckyMod *
        13 *
        777 *
        0.5;
    // Blah
    result.blah = 0;
    return result;
}

function reindeerValue(wrathValue) {
    var value = 0;
    if (Game.season == "christmas") {
        var remaining =
            1 -
            (frenzyProbability(wrathValue) +
                clotProbability(wrathValue) +
                bloodProbability(wrathValue));
        var outputMod = Game.Has("Ho ho ho-flavored frosting") ? 2 : 1;

        value +=
            Math.max(25, baseCps() * outputMod * 60 * 7) *
            frenzyProbability(wrathValue);
        value +=
            Math.max(25, baseCps() * outputMod * 60 * 0.5) *
            clotProbability(wrathValue);
        value +=
            Math.max(25, baseCps() * outputMod * 60 * 666) *
            bloodProbability(wrathValue);
        value += Math.max(25, baseCps() * outputMod * 60) * remaining;
    }
    return value;
}

function reindeerCps(wrathValue) {
    var averageTime = probabilitySpan("reindeer", 0, 0.5) / Game.fps;
    return (
        (reindeerValue(wrathValue) / averageTime) * FrozenCookies.simulatedGCPercent
    );
}

function calculateChainValue(bankAmount, cps, digit) {
    x = Math.min(bankAmount, cps * 60 * 60 * 6 * 4);
    n = Math.floor(Math.log((9 * x) / (4 * digit)) / Math.LN10);
    return 125 * Math.pow(9, n - 3) * digit;
}

function chocolateValue(bankAmount, earthShatter) {
    var value = 0;
    if (Game.HasUnlocked("Chocolate egg") && !Game.Has("Chocolate egg")) {
        bankAmount =
            bankAmount != null && bankAmount !== 0 ? bankAmount : Game.cookies;
        var sellRatio = 0.25;
        var highestBuilding = 0;
        if (earthShatter == null) {
            if (Game.hasAura("Earth Shatterer")) sellRatio = 0.5;
        } else if (earthShatter) {
            sellRatio = 0.5;
            if (!Game.hasAura("Earth Shatterer")) {
                for (var i in Game.Objects) {
                    if (Game.Objects[i].amount > 0) highestBuilding = Game.Objects[i];
                }
            }
        }
        value =
            0.05 *
            (wrinklerValue() +
                bankAmount +
                Game.ObjectsById.reduce(function(s, b) {
                    return (
                        s +
                        cumulativeBuildingCost(
                            b.basePrice,
                            1,
                            (b == highestBuilding ? b.amount : b.amount + 1) - b.free
                        ) *
                        sellRatio
                    );
                }, 0));
    }
    return value;
}

function wrinklerValue() {
    return Game.wrinklers.reduce(function(s, w) {
        return s + popValue(w);
    }, 0);
}

function buildingRemaining(building, amount) {
    var cost = cumulativeBuildingCost(
        building.basePrice,
        building.amount,
        amount
    );
    var availableCookies =
        Game.cookies +
        wrinklerValue() +
        Game.ObjectsById.reduce(function(s, b) {
            return (
                s +
                (b.name == building.name ?
                    0 :
                    cumulativeBuildingCost(b.basePrice, 1, b.amount + 1) / 2)
            );
        }, 0);
    availableCookies *=
        Game.HasUnlocked("Chocolate egg") && !Game.Has("Chocolate egg") ? 1.05 : 1;
    return Math.max(0, cost - availableCookies);
}

function earnedRemaining(total) {
    return Math.max(
        0,
        total - (Game.cookiesEarned + wrinklerValue() + chocolateValue())
    );
}

function estimatedTimeRemaining(cookies) {
    return timeDisplay(cookies / effectiveCps());
}

function canCastSE() {
    if (M.magicM >= 80 && Game.Objects["Cortex baker"].amount > 0) return 1;
    return 0;
}

function edificeBank() {
    if (!canCastSE) return 0;
    var cmCost = Game.Objects["Cortex baker"].price;
    return Game.hasBuff("everything must go") ?
        (cmCost * (100 / 95)) / 2 :
        cmCost / 2;
}

function luckyBank() {
    return baseCps() * 60 * 100;
}

function luckyFrenzyBank() {
    var bank = baseCps() * 60 * 100 * 7;
    // Adds the price of Get Lucky (with discounts) since that would need to be
    // purchased in order for this bank to make sense.
    bank += Game.Has('Get lucky') ? 0 : Game.UpgradesById[86].getPrice();
    return bank;
}

function chainBank() {
    //  More exact
    var digit = 7 - Math.floor(Game.elderWrath / 3);
    return (
        4 *
        Math.floor(
            (digit / 9) *
            Math.pow(
                10,
                Math.floor(Math.log((194400 * baseCps()) / digit) / Math.LN10)
            )
        )
    );
    //  return baseCps() * 60 * 60 * 6 * 4;
}

function harvestBank() {
    if (!FrozenCookies.setHarvestBankPlant) return 0;

    FrozenCookies.harvestMinutes = 0;
    FrozenCookies.harvestMaxPercent = 0;
    FrozenCookies.harvestFrenzy = 1;
    FrozenCookies.harvestBuilding = 1;
    FrozenCookies.harvestPlant = "";

    if (
        FrozenCookies.setHarvestBankType == 1 ||
        FrozenCookies.setHarvestBankType == 3
    ) {
        FrozenCookies.harvestFrenzy = 7;
    }

    if (
        FrozenCookies.setHarvestBankType == 2 ||
        FrozenCookies.setHarvestBankType == 3
    ) {
        var harvestBuildingArray = [
            Game.Objects["Cursor"].amount,
            Game.Objects["Grandma"].amount,
            Game.Objects["Farm"].amount,
            Game.Objects["Mine"].amount,
            Game.Objects["Factory"].amount,
            Game.Objects["Bank"].amount,
            Game.Objects["Temple"].amount,
            Game.Objects["Wizard tower"].amount,
            Game.Objects["Shipment"].amount,
            Game.Objects["Alchemy lab"].amount,
            Game.Objects["Portal"].amount,
            Game.Objects["Time machine"].amount,
            Game.Objects["Antimatter condenser"].amount,
            Game.Objects["Prism"].amount,
            Game.Objects["Chancemaker"].amount,
            Game.Objects["Fractal engine"].amount,
            Game.Objects["Javascript console"].amount,
            Game.Objects["Idleverse"].amount,
            Game.Objects["Cortex baker"].amount,
        ];
        harvestBuildingArray.sort(function(a, b) {
            return b - a;
        });

        for (
            var buildingLoop = 0; buildingLoop < FrozenCookies.maxSpecials; buildingLoop++
        ) {
            FrozenCookies.harvestBuilding *= harvestBuildingArray[buildingLoop];
        }
    }

    switch (FrozenCookies.setHarvestBankPlant) {
        case 1:
            FrozenCookies.harvestPlant = "Bakeberry";
            FrozenCookies.harvestMinutes = 30;
            FrozenCookies.harvestMaxPercent = 0.03;
            break;

        case 2:
            FrozenCookies.harvestPlant = "Chocoroot";
            FrozenCookies.harvestMinutes = 3;
            FrozenCookies.harvestMaxPercent = 0.03;
            break;

        case 3:
            FrozenCookies.harvestPlant = "White Chocoroot";
            FrozenCookies.harvestMinutes = 3;
            FrozenCookies.harvestMaxPercent = 0.03;
            break;

        case 4:
            FrozenCookies.harvestPlant = "Queenbeet";
            FrozenCookies.harvestMinutes = 60;
            FrozenCookies.harvestMaxPercent = 0.04;
            break;

        case 5:
            FrozenCookies.harvestPlant = "Duketater";
            FrozenCookies.harvestMinutes = 120;
            FrozenCookies.harvestMaxPercent = 0.08;
            break;

        case 6:
            FrozenCookies.harvestPlant = "Crumbspore";
            FrozenCookies.harvestMinutes = 1;
            FrozenCookies.harvestMaxPercent = 0.01;
            break;

        case 7:
            FrozenCookies.harvestPlant = "Doughshroom";
            FrozenCookies.harvestMinutes = 5;
            FrozenCookies.harvestMaxPercent = 0.03;
            break;
    }

    if (FrozenCookies.maxSpecials == 0) {
        FrozenCookies.maxSpecials = 1;
    }

    return (
        (baseCps() *
            60 *
            FrozenCookies.harvestMinutes *
            FrozenCookies.harvestFrenzy *
            FrozenCookies.harvestBuilding) /
        Math.pow(10, FrozenCookies.maxSpecials) /
        FrozenCookies.harvestMaxPercent
    );
}

function cookieEfficiency(startingPoint, bankAmount) {
    var results = Number.MAX_VALUE;
    var currentValue = cookieValue(startingPoint);
    var bankValue = cookieValue(bankAmount);
    var bankCps = gcPs(bankValue);
    if (bankCps > 0) {
        if (bankAmount <= startingPoint) {
            results = 0;
        } else {
            var cost = Math.max(0, bankAmount - startingPoint);
            var deltaCps = gcPs(bankValue - currentValue);
            results = divCps(cost, deltaCps);
        }
    } else if (bankAmount <= startingPoint) {
        results = 0;
    }
    return results;
}

function bestBank(minEfficiency) {
    var results = {};
    var edifice =
        FrozenCookies.autoSpell == 3 || FrozenCookies.holdSEBank ?
        edificeBank() :
        0;
    var bankLevels = [0, luckyBank(), luckyFrenzyBank(), harvestBank()]
        .sort(function(a, b) {
            return b - a;
        })
        .map(function(bank) {
            return {
                cost: bank,
                efficiency: cookieEfficiency(Game.cookies, bank),
            };
        })
        .filter(function(bank) {
            return (bank.efficiency >= 0 && bank.efficiency <= minEfficiency) ||
                FrozenCookies.setHarvestBankPlant ?
                bank :
                null;
        });
    if (bankLevels[0].cost > edifice || FrozenCookies.setHarvestBankPlant) {
        return bankLevels[0];
    }
    return {
        cost: edifice,
        efficiency: 1,
    };
}

function weightedCookieValue(useCurrent) {
    var cps = baseCps();
    var lucky_mod = Game.Has("Get lucky");
    var base_wrath = lucky_mod ? 401.835 * cps : 396.51 * cps;
    //  base_wrath += 192125500000;
    var base_golden = lucky_mod ? 2804.76 * cps : 814.38 * cps;
    if (Game.cookiesEarned >= 100000) {
        var remainingProbability = 1;
        var startingValue = "6666";
        var rollingEstimate = 0;
        for (
            var i = 5; i < Math.min(Math.floor(Game.cookies).toString().length, 12); i++
        ) {
            startingValue += "6";
            rollingEstimate += 0.1 * remainingProbability * startingValue;
            remainingProbability -= remainingProbability * 0.1;
        }
        rollingEstimate += remainingProbability * startingValue;
        //    base_golden += 10655700000;
        base_golden += rollingEstimate * 0.0033;
        base_wrath += rollingEstimate * 0.0595;
    }
    if (useCurrent && Game.cookies < maxLuckyBank()) {
        if (lucky_mod) {
            base_golden -=
                (900 * cps - Math.min(900 * cps, Game.cookies * 0.15)) * 0.49 * 0.5 +
                (maxLuckyValue() - Game.cookies * 0.15) * 0.49 * 0.5;
        } else {
            base_golden -= (maxLuckyValue() - Game.cookies * 0.15) * 0.49;
            base_wrath -= (maxLuckyValue() - Game.cookies * 0.15) * 0.29;
        }
    }
    return (
        (Game.elderWrath / 3.0) * base_wrath +
        ((3 - Game.elderWrath) / 3.0) * base_golden
    );
}

function maxLuckyValue() {
    var gcMod = Game.Has("Get lucky") ? 6300 : 900;
    return baseCps() * gcMod;
}

function maxLuckyBank() {
    return Game.Has("Get lucky") ? luckyFrenzyBank() : luckyBank();
}

function maxCookieTime() {
    return Game.shimmerTypes.golden.maxTime;
}

function gcPs(gcValue) {
    var averageGCTime = probabilitySpan("golden", 0, 0.5) / Game.fps;
    gcValue /= averageGCTime;
    gcValue *= FrozenCookies.simulatedGCPercent;
    return gcValue;
}

function gcEfficiency() {
    if (gcPs(weightedCookieValue()) <= 0) {
        return Number.MAX_VALUE;
    }
    var cost = Math.max(0, maxLuckyValue() * 10 - Game.cookies);
    var deltaCps = gcPs(weightedCookieValue() - weightedCookieValue(true));
    return divCps(cost, deltaCps);
}

function delayAmount() {
    return bestBank(nextChainedPurchase().efficiency).cost;
    /*
        if (nextChainedPurchase().efficiency > gcEfficiency() || (Game.frenzy && Game.Has('Get lucky'))) {
          return maxLuckyValue() * 10;
        } else if (weightedCookieValue() > weightedCookieValue(true)) {
          return Math.min(maxLuckyValue() * 10, Math.max(0,(nextChainedPurchase().efficiency - (gcEfficiency() * baseCps())) / gcEfficiency()));
        } else {
         return 0;
        }
      */
}

function haveAll(holiday) {
    return _.every(holidayCookies[holiday], function(id) {
        return Game.UpgradesById[id].unlocked;
    });
}

function checkPrices(currentUpgrade) {
    var value = 0;
    if (FrozenCookies.caches.recommendationList.length > 0) {
        var nextRec = FrozenCookies.caches.recommendationList.filter(function(i) {
            return i.id != currentUpgrade.id;
        })[0];
        var nextPrereq =
            nextRec.type == "upgrade" ?
            unfinishedUpgradePrereqs(nextRec.purchase) :
            null;
        nextRec =
            nextPrereq == null ||
            nextPrereq.filter(function(u) {
                return u.cost != null;
            }).length == 0 ?
            nextRec :
            FrozenCookies.caches.recommendationList.filter(function(a) {
                return nextPrereq.some(function(b) {
                    return b.id == a.id && b.type == a.type;
                });
            })[0];
        value =
            nextRec.cost == null ?
            0 :
            nextRec.cost / totalDiscount(nextRec.type == "building") -
            nextRec.cost;
    }
    return value;
}

// Use this for changes to future efficiency calcs
function purchaseEfficiency(price, deltaCps, baseDeltaCps, currentCps) {
    var efficiency = Number.POSITIVE_INFINITY;
    if (deltaCps > 0) {
        efficiency =
            FrozenCookies.efficiencyWeight * divCps(price, currentCps) +
            divCps(price, deltaCps);
    }
    return efficiency;
}

function recommendationList(recalculate) {
    if (recalculate) {
        FrozenCookies.showAchievements = false;
        FrozenCookies.caches.recommendationList = addScores(
            upgradeStats(recalculate)
            .concat(buildingStats(recalculate))
            .concat(santaStats())
            .sort(function(a, b) {
                return a.efficiency != b.efficiency ?
                    a.efficiency - b.efficiency :
                    a.delta_cps != b.delta_cps ?
                    b.delta_cps - a.delta_cps :
                    a.cost - b.cost;
            })
        );
        if (FrozenCookies.pastemode) {
            FrozenCookies.caches.recommendationList.reverse();
        }
        FrozenCookies.showAchievements = true;
    }
    return FrozenCookies.caches.recommendationList;
}

function addScores(recommendations) {
    var filteredList = recommendations.filter(function(a) {
        return (
            a.efficiency < Number.POSITIVE_INFINITY &&
            a.efficiency > Number.NEGATIVE_INFINITY
        );
    });
    if (filteredList.length > 0) {
        var minValue = Math.log(recommendations[0].efficiency);
        var maxValue = Math.log(
            recommendations[filteredList.length - 1].efficiency
        );
        var spread = maxValue - minValue;
        recommendations.forEach(function(purchaseRec, index) {
            if (
                purchaseRec.efficiency < Number.POSITIVE_INFINITY &&
                purchaseRec.efficiency > Number.NEGATIVE_INFINITY
            ) {
                var purchaseValue = Math.log(purchaseRec.efficiency);
                var purchaseSpread = purchaseValue - minValue;
                recommendations[index].efficiencyScore = 1 - purchaseSpread / spread;
            } else {
                recommendations[index].efficiencyScore = 0;
            }
        });
    } else {
        recommendations.forEach(function(purchaseRec, index) {
            recommendations[index].efficiencyScore = 0;
        });
    }
    return recommendations;
}

function nextPurchase(recalculate) {
    if (recalculate) {
        FrozenCookies.showAchievements = false;
        var recList = recommendationList(recalculate);
        var purchase = null;
        var target = null;
        for (var i = 0; i < recList.length; i++) {
            target = recList[i];
            if (
                target.type == "upgrade" &&
                unfinishedUpgradePrereqs(Game.UpgradesById[target.id])
            ) {
                var prereqList = unfinishedUpgradePrereqs(Game.UpgradesById[target.id]);
                purchase = recList.filter(function(a) {
                    return prereqList.some(function(b) {
                        return b.id == a.id && b.type == a.type;
                    });
                })[0];
            } else {
                purchase = target;
            }
            if (purchase) {
                FrozenCookies.caches.nextPurchase = purchase;
                FrozenCookies.caches.nextChainedPurchase = target;
                break;
            }
        }
        if (purchase == null) {
            FrozenCookies.caches.nextPurchase = defaultPurchase();
            FrozenCookies.caches.nextChainedPurchase = defaultPurchase();
        }
        FrozenCookies.showAchievements = true;
    }
    return FrozenCookies.caches.nextPurchase;
    //  return purchase;
}

function nextChainedPurchase(recalculate) {
    nextPurchase(recalculate);
    return FrozenCookies.caches.nextChainedPurchase;
}

function buildingStats(recalculate) {
    if (recalculate) {
        if (blacklist[FrozenCookies.blacklist].buildings === true) {
            FrozenCookies.caches.buildings = [];
        } else {
            var buildingBlacklist = Array.from(
                blacklist[FrozenCookies.blacklist].buildings
            );
            //If autocasting Spontaneous Edifice, don't buy any Cortex baker after 399
            if (
                M &&
                FrozenCookies.autoSpell == 3 &&
                Game.Objects["Cortex baker"].amount >= 399
            ) {
                buildingBlacklist.push(16);
            }
            //Stop buying wizard towers at max Mana if enabled
            if (
                M &&
                FrozenCookies.towerLimit &&
                M.magicM >= FrozenCookies.manaMax
            ) {
                buildingBlacklist.push(7);
            }
            //Stop buying Mines if at set limit
            if (
                FrozenCookies.mineLimit &&
                Game.Objects["Mine"].amount >= FrozenCookies.mineMax
            ) {
                buildingBlacklist.push(3);
            }
            //Stop buying Factories if at set limit
            if (
                FrozenCookies.factoryLimit &&
                Game.Objects["Factory"].amount >= FrozenCookies.factoryMax
            ) {
                buildingBlacklist.push(4);
            }
            FrozenCookies.caches.buildings = Game.ObjectsById.map(function(
                current,
                index
            ) {
                if (_.contains(buildingBlacklist, current.id)) {
                    return null;
                }
                var currentBank = bestBank(0).cost;
                var baseCpsOrig = baseCps();
                var cpsOrig = effectiveCps(Math.min(Game.cookies, currentBank)); // baseCpsOrig + gcPs(cookieValue(Math.min(Game.cookies, currentBank))) + baseClickingCps(FrozenCookies.autoClick * FrozenCookies.cookieClickSpeed);
                var existingAchievements = Object.values(Game.AchievementsById).map(function(
                    item,
                    i
                ) {
                    return item.won;
                });
                buildingToggle(current);
                var baseCpsNew = baseCps();
                var cpsNew = effectiveCps(currentBank); // baseCpsNew + gcPs(cookieValue(currentBank)) + baseClickingCps(FrozenCookies.autoClick * FrozenCookies.cookieClickSpeed);
                buildingToggle(current, existingAchievements);
                var deltaCps = cpsNew - cpsOrig;
                var baseDeltaCps = baseCpsNew - baseCpsOrig;
                var efficiency = purchaseEfficiency(
                    current.getPrice(),
                    deltaCps,
                    baseDeltaCps,
                    cpsOrig
                );
                return {
                    id: current.id,
                    efficiency: efficiency,
                    base_delta_cps: baseDeltaCps,
                    delta_cps: deltaCps,
                    cost: current.getPrice(),
                    purchase: current,
                    type: "building",
                };
            }).filter(function(a) {
                return a;
            });
        }
    }
    return FrozenCookies.caches.buildings;
}

function upgradeStats(recalculate) {
    if (recalculate) {
        if (blacklist[FrozenCookies.blacklist].upgrades === true) {
            FrozenCookies.caches.upgrades = [];
        } else {
            var upgradeBlacklist = blacklist[FrozenCookies.blacklist].upgrades;
            FrozenCookies.caches.upgrades = Object.values(Game.UpgradesById).map(function(current) {
                if (!current.bought) {
                    if (isUnavailable(current, upgradeBlacklist)) {
                        return null;
                    }
                    var currentBank = bestBank(0).cost;
                    var cost = upgradePrereqCost(current);
                    var baseCpsOrig = baseCps();
                    var cpsOrig = effectiveCps(Math.min(Game.cookies, currentBank));
                    var existingAchievements = Object.values(Game.AchievementsById).map(function(item) {
                        return item.won;
                    });
                    var existingWrath = Game.elderWrath;
                    var discounts = totalDiscount() + totalDiscount(true);
                    var reverseFunctions = upgradeToggle(current);
                    var baseCpsNew = baseCps();
                    var cpsNew = effectiveCps(currentBank);
                    var priceReduction =
                        discounts == totalDiscount() + totalDiscount(true) ?
                        0 :
                        checkPrices(current);
                    upgradeToggle(current, existingAchievements, reverseFunctions);
                    Game.elderWrath = existingWrath;
                    var deltaCps = cpsNew - cpsOrig;
                    var baseDeltaCps = baseCpsNew - baseCpsOrig;
                    var efficiency =
                        current.season &&
                        current.season == seasons[FrozenCookies.defaultSeason] ?
                        cost / baseCpsOrig :
                        priceReduction > cost ?
                        1 :
                        purchaseEfficiency(cost, deltaCps, baseDeltaCps, cpsOrig);
                    return {
                        id: current.id,
                        efficiency: efficiency,
                        base_delta_cps: baseDeltaCps,
                        delta_cps: deltaCps,
                        cost: cost,
                        purchase: current,
                        type: "upgrade",
                    };
                }
            }).filter(function(a) {
                return a;
            });
        }
    }
    return FrozenCookies.caches.upgrades;
}

function isUnavailable(upgrade, upgradeBlacklist) {
    // should we even recommend upgrades at all?
    if (upgradeBlacklist === true) {
        return true;
    }

    // check if the upgrade is in the selected blacklist, or is an upgrade that shouldn't be recommended
    if (upgradeBlacklist.concat(recommendationBlacklist).includes(upgrade.id)) {
        return true;
    }

    if (upgrade.id == 74 && (Game.season == "halloween" || Game.season == "easter") && !haveAll(Game.season)) { // Don't pledge if Easter or Halloween not complete
        return true;
    }

    if (App && upgrade.id == 816) { // Web cookies are only on Browser
        return true;
    }

    if (!App && upgrade.id == 817) { // Steamed cookies are only on Steam
        return true;
    }

    var result = false;

    var needed = unfinishedUpgradePrereqs(upgrade);
    result = result || (!upgrade.unlocked && !needed);
    result =
        result ||
        (_.find(needed, function(a) {
                return a.type == "wrinklers";
            }) != null &&
            needed);
    result =
        result ||
        (_.find(needed, function(a) {
                return a.type == "santa";
            }) != null &&
            "christmas" != Game.season &&
            !Game.UpgradesById[181].unlocked &&
            !Game.prestige);
    result =
        result ||
        (upgrade.season &&
            (!haveAll(Game.season) ||
                (upgrade.season != seasons[FrozenCookies.defaultSeason] &&
                    haveAll(upgrade.season))));

    return result;
}

function santaStats() {
    return Game.Has("A festive hat") &&
        Game.santaLevel + 1 < Game.santaLevels.length ? {
            id: 0,
            efficiency: Infinity,
            base_delta_cps: 0,
            delta_cps: 0,
            cost: cumulativeSantaCost(1),
            type: "santa",
            purchase: {
                id: 0,
                name: "Santa Stage Upgrade (" +
                    Game.santaLevels[(Game.santaLevel + 1) % Game.santaLevels.length] +
                    ")",
                buy: buySanta,
                getCost: function() {
                    return cumulativeSantaCost(1);
                },
            },
        } : [];
}

function defaultPurchase() {
    return {
        id: 0,
        efficiency: Infinity,
        delta_cps: 0,
        base_delta_cps: 0,
        cost: Infinity,
        type: "other",
        purchase: {
            id: 0,
            name: "No valid purchases!",
            buy: function() {},
            getCost: function() {
                return Infinity;
            },
        },
    };
}

function totalDiscount(building) {
    var price = 1;
    if (building) {
        if (Game.Has("Season savings")) price *= 0.99;
        if (Game.Has("Santa's dominion")) price *= 0.99;
        if (Game.Has("Faberge egg")) price *= 0.99;
        if (Game.Has("Divine discount")) price *= 0.99;
        if (Game.hasAura("Fierce Hoarder")) price *= 0.98;
        if (Game.hasBuff("Everything must go")) price *= 0.95;
    } else {
        if (Game.Has("Toy workshop")) price *= 0.95;
        if (Game.Has("Five-finger discount"))
            price *= Math.pow(0.99, Game.Objects["Cursor"].amount / 100);
        if (Game.Has("Santa's dominion")) price *= 0.98;
        if (Game.Has("Faberge egg")) price *= 0.99;
        if (Game.Has("Divine sales")) price *= 0.99;
        if (Game.hasAura("Master of the Armory")) price *= 0.98;
    }
    return price;
}

function cumulativeBuildingCost(basePrice, startingNumber, endingNumber) {
    return (
        (basePrice *
            totalDiscount(true) *
            (Math.pow(Game.priceIncrease, endingNumber) -
                Math.pow(Game.priceIncrease, startingNumber))) /
        (Game.priceIncrease - 1)
    );
}

function cumulativeSantaCost(amount) {
    var total = 0;
    if (!amount) {} else if (Game.santaLevel + amount < Game.santaLevels.length) {
        for (var i = Game.santaLevel + 1; i <= Game.santaLevel + amount; i++) {
            total += Math.pow(i, i);
        }
    } else if (amount < Game.santaLevels.length) {
        for (var i = Game.santaLevel + 1; i <= amount; i++) {
            total += Math.pow(i, i);
        }
    } else {
        total = Infinity;
    }
    return total;
}

function upgradePrereqCost(upgrade, full) {
    var cost = upgrade.getPrice();
    if (upgrade.unlocked) {
        return cost;
    }
    var prereqs = upgradeJson[upgrade.id];
    if (prereqs) {
        cost += prereqs.buildings.reduce(function(sum, item, index) {
            var building = Game.ObjectsById[index];
            if (item && full) {
                sum += cumulativeBuildingCost(building.basePrice, 0, item);
            } else if (item && building.amount < item) {
                sum += cumulativeBuildingCost(
                    building.basePrice,
                    building.amount,
                    item
                );
            }
            return sum;
        }, 0);
        cost += prereqs.upgrades.reduce(function(sum, item) {
            var reqUpgrade = Game.UpgradesById[item];
            if (!upgrade.bought || full) {
                sum += upgradePrereqCost(reqUpgrade, full);
            }
            return sum;
        }, 0);
        cost += cumulativeSantaCost(prereqs.santa);
    }
    return cost;
}

function unfinishedUpgradePrereqs(upgrade) {
    if (upgrade.unlocked) {
        return null;
    }
    var needed = [];
    var prereqs = upgradeJson[upgrade.id];
    if (prereqs) {
        prereqs.buildings.forEach(function(a, b) {
            if (a && Game.ObjectsById[b].amount < a) {
                needed.push({
                    type: "building",
                    id: b,
                });
            }
        });
        prereqs.upgrades.forEach(function(a) {
            if (!Game.UpgradesById[a].bought) {
                var recursiveUpgrade = Game.UpgradesById[a];
                var recursivePrereqs = unfinishedUpgradePrereqs(recursiveUpgrade);
                if (recursiveUpgrade.unlocked) {
                    needed.push({
                        type: "upgrade",
                        id: a,
                    });
                } else if (!recursivePrereqs) {
                    // Research is being done.
                } else {
                    recursivePrereqs.forEach(function(a) {
                        if (
                            !needed.some(function(b) {
                                return b.id == a.id && b.type == a.type;
                            })
                        ) {
                            needed.push(a);
                        }
                    });
                }
            }
        });
        if (prereqs.santa) {
            // season: 'christmas': could use this to auto filter necessary seasons,
            // currently not doing, bc it would need iteration method or to change needed into an object
            // that stores the seasons required at the top
            needed.push({
                type: "santa",
                id: 0,
            });
        }
        if (prereqs.wrinklers && Game.elderWrath == 0) {
            needed.push({
                type: "wrinklers",
                id: 0,
            });
        }
    }
    return needed.length ? needed : null;
}

function upgradeToggle(upgrade, achievements, reverseFunctions) {
    if (!achievements) {
        reverseFunctions = {};
        if (!upgrade.unlocked) {
            var prereqs = upgradeJson[upgrade.id];
            if (prereqs) {
                reverseFunctions.prereqBuildings = [];
                prereqs.buildings.forEach(function(a, b) {
                    var building = Game.ObjectsById[b];
                    if (a && building.amount < a) {
                        var difference = a - building.amount;
                        reverseFunctions.prereqBuildings.push({
                            id: b,
                            amount: difference,
                        });
                        building.amount += difference;
                        building.bought += difference;
                        Game.BuildingsOwned += difference;
                    }
                });
                reverseFunctions.prereqUpgrades = [];
                if (prereqs.upgrades.length > 0) {
                    prereqs.upgrades.forEach(function(id) {
                        var upgrade = Game.UpgradesById[id];
                        if (!upgrade.bought) {
                            reverseFunctions.prereqUpgrades.push({
                                id: id,
                                reverseFunctions: upgradeToggle(upgrade),
                            });
                        }
                    });
                }
            }
        }
        upgrade.bought = 1;
        Game.UpgradesOwned += 1;
        reverseFunctions.current = buyFunctionToggle(upgrade);
    } else {
        if (reverseFunctions.prereqBuildings) {
            reverseFunctions.prereqBuildings.forEach(function(b) {
                var building = Game.ObjectsById[b.id];
                building.amount -= b.amount;
                building.bought -= b.amount;
                Game.BuildingsOwned -= b.amount;
            });
        }
        if (reverseFunctions.prereqUpgrades) {
            reverseFunctions.prereqUpgrades.forEach(function(u) {
                var upgrade = Game.UpgradesById[u.id];
                upgradeToggle(upgrade, [], u.reverseFunctions);
            });
        }
        upgrade.bought = 0;
        Game.UpgradesOwned -= 1;
        buyFunctionToggle(reverseFunctions.current);
        Game.AchievementsOwned = 0;
        achievements.forEach(function(won, index) {
            var achievement = Game.AchievementsById[index];
            achievement.won = won;
            if (won && achievement.pool != "shadow") {
                Game.AchievementsOwned += 1;
            }
        });
    }
    Game.recalculateGains = 1;
//    Game.CalculateGains();
    return reverseFunctions;
}

function buildingToggle(building, achievements) {
    if (!achievements) {
        building.amount += 1;
        building.bought += 1;
        Game.BuildingsOwned += 1;
    } else {
        building.amount -= 1;
        building.bought -= 1;
        Game.BuildingsOwned -= 1;
        Game.AchievementsOwned = 0;
        achievements.forEach(function(won, index) {
            var achievement = Game.AchievementsById[index];
            achievement.won = won;
            if (won && achievement.pool != "shadow") {
                Game.AchievementsOwned += 1;
            }
        });
    }
    Game.recalculateGains = 1;
    Game.CalculateGains();
}

function buyFunctionToggle(upgrade) {
    if (upgrade && upgrade.id == 452) return null;
    if (upgrade && !upgrade.length) {
        if (!upgrade.buyFunction) {
            return null;
        }

        var ignoreFunctions = [
            /Game\.Earn\('.*\)/,
            /Game\.Lock\('.*'\)/,
            /Game\.Unlock\(.*\)/,
            /Game\.Objects\['.*'\]\.drawFunction\(\)/,
            /Game\.Objects\['.*'\]\.redraw\(\)/,
            /Game\.SetResearch\('.*'\)/,
            /Game\.Upgrades\['.*'\]\.basePrice=.*/,
            /Game\.CollectWrinklers\(\)/,
            /Game\.RefreshBuildings\(\)/,
            /Game\.storeToRefresh=1/,
            /Game\.upgradesToRebuild=1/,
            /Game\.Popup\(.*\)/,
            /Game\.Notify\(.*\)/,
            /var\s+.+\s*=.+/,
            /Game\.computeSeasonPrices\(\)/,
            /Game\.seasonPopup\.reset\(\)/,
            /\S/,
        ];
        var buyFunctions = upgrade.buyFunction
            .toString()
            .replace(/[\n\r\s]+/g, " ")
            .replace(/function\s*\(\)\s*{(.+)\s*}/, "$1")
            .replace(/for\s*\(.+\)\s*\{.+\}/, "")
            .replace(
                /if\s*\(this\.season\)\s*Game\.season=this\.season\;/,
                'Game.season="' + upgrade.season + '";'
            )
            .replace(/if\s*\(.+\)\s*[^{}]*?\;/, "")
            .replace(/if\s*\(.+\)\s*\{.+\}/, "")
            .replace(/else\s+\(.+\)\s*\;/, "")
            .replace("++", "+=1")
            .replace("--", "-=1")
            .split(";")
            .map(function(a) {
                return a.trim();
            })
            .filter(function(a) {
                ignoreFunctions.forEach(function(b) {
                    a = a.replace(b, "");
                });
                return a != "";
            });

        if (buyFunctions.length == 0) {
            return null;
        }

        var reversedFunctions = buyFunctions.map(function(a) {
            var reversed = "";
            var achievementMatch = /Game\.Win\('(.*)'\)/.exec(a);
            if (a.indexOf("+=") > -1) {
                reversed = a.replace("+=", "-=");
            } else if (a.indexOf("-=") > -1) {
                reversed = a.replace("-=", "+=");
            } else if (
                achievementMatch &&
                Game.Achievements[achievementMatch[1]].won == 0
            ) {
                reversed = "Game.Achievements['" + achievementMatch[1] + "'].won=0";
            } else if (a.indexOf("=") > -1) {
                var expression = a.split("=");
                var expressionResult = eval(expression[0]);
                var isString = _.isString(expressionResult);
                reversed =
                    expression[0] +
                    "=" +
                    (isString ? "'" : "") +
                    expressionResult +
                    (isString ? "'" : "");
            }
            return reversed;
        });
        buyFunctions.forEach(function(f) {
            eval(f);
        });
        return reversedFunctions;
    } else if (upgrade && upgrade.length) {
        upgrade.forEach(function(f) {
            eval(f);
        });
    }
    return null;
}

function buySanta() {
    Game.specialTab = "santa";
    Game.UpgradeSanta();
    if (Game.santaLevel + 1 >= Game.santaLevels.length) {
        Game.ToggleSpecialMenu();
    }
}

function statSpeed() {
    var speed = 0;
    switch (FrozenCookies.trackStats) {
        case 1: // 60s
            speed = 1000 * 60;
            break;
        case 2: // 30m
            speed = 1000 * 60 * 30;
            break;
        case 3: // 1h
            speed = 1000 * 60 * 60;
            break;
        case 4: // 24h
            speed = 1000 * 60 * 60 * 24;
            break;
    }
    return speed;
}

function saveStats(fromGraph) {
    FrozenCookies.trackedStats.push({
        time: Date.now() - Game.startDate,
        baseCps: baseCps(),
        effectiveCps: effectiveCps(),
        hc: Game.HowMuchPrestige(
            Game.cookiesEarned + Game.cookiesReset + wrinklerValue()
        ),
        actualClicks: Game.cookieClicks,
    });
    if (
        $("#statGraphContainer").length > 0 &&
        !$("#statGraphContainer").is(":hidden") &&
        !fromGraph
    ) {
        viewStatGraphs();
    }
}

function viewStatGraphs() {
    saveStats(true);
    var containerDiv = $("#statGraphContainer").length ?
        $("#statGraphContainer") :
        $("<div>")
        .attr("id", "statGraphContainer")
        .html($("<div>").attr("id", "statGraphs"))
        .appendTo("body")
        .dialog({
            modal: true,
            title: "Frozen Cookies Tracked Stats",
            width: $(window).width() * 0.8,
            height: $(window).height() * 0.8,
        });
    if (containerDiv.is(":hidden")) {
        containerDiv.dialog();
    }
    if (
        FrozenCookies.trackedStats.length > 0 &&
        Date.now() - FrozenCookies.lastGraphDraw > 1000
    ) {
        FrozenCookies.lastGraphDraw = Date.now();
        $("#statGraphs").empty();
        var graphs = $.jqplot(
            "statGraphs",
            transpose(
                FrozenCookies.trackedStats.map(function(s) {
                    return [
                        [s.time / 1000, s.baseCps],
                        [s.time / 1000, s.effectiveCps],
                        [s.time / 1000, s.hc],
                    ];
                })
            ), //
            {
                legend: {
                    show: true,
                },
                height: containerDiv.height() - 50,
                axes: {
                    xaxis: {
                        tickRenderer: $.jqplot.CanvasAxisTickRenderer,
                        tickOptions: {
                            angle: -30,
                            fontSize: "10pt",
                            showGridline: false,
                            formatter: function(ah, ai) {
                                return timeDisplay(ai);
                            },
                        },
                    },
                    yaxis: {
                        padMin: 0,
                        renderer: $.jqplot.LogAxisRenderer,
                        tickDistribution: "even",
                        tickOptions: {
                            formatter: function(ah, ai) {
                                return Beautify(ai);
                            },
                        },
                    },
                    y2axis: {
                        padMin: 0,
                        tickOptions: {
                            showGridline: false,
                            formatter: function(ah, ai) {
                                return Beautify(ai);
                            },
                        },
                    },
                },
                highlighter: {
                    show: true,
                    sizeAdjust: 15,
                },
                series: [{
                        label: "Base CPS",
                    },
                    {
                        label: "Effective CPS",
                    },
                    {
                        label: "Earned HC",
                        yaxis: "y2axis",
                    },
                ],
            }
        );
    }
}

function updateCaches() {
    var recommendation,
        currentBank,
        targetBank,
        currentCookieCPS,
        currentUpgradeCount;
    var recalcCount = 0;
    do {
        recommendation = nextPurchase(FrozenCookies.recalculateCaches);
        FrozenCookies.recalculateCaches = false;
        currentBank = bestBank(0);
        targetBank = bestBank(recommendation.efficiency);
        currentCookieCPS = gcPs(cookieValue(currentBank.cost));
        currentUpgradeCount = Game.UpgradesInStore.length;
        FrozenCookies.safeGainsCalc();

        if (FrozenCookies.lastCPS != FrozenCookies.calculatedCps) {
            FrozenCookies.recalculateCaches = true;
            FrozenCookies.lastCPS = FrozenCookies.calculatedCps;
        }

        if (FrozenCookies.currentBank.cost != currentBank.cost) {
            FrozenCookies.recalculateCaches = true;
            FrozenCookies.currentBank = currentBank;
        }

        if (FrozenCookies.targetBank.cost != targetBank.cost) {
            FrozenCookies.recalculateCaches = true;
            FrozenCookies.targetBank = targetBank;
        }

        if (FrozenCookies.lastCookieCPS != currentCookieCPS) {
            FrozenCookies.recalculateCaches = true;
            FrozenCookies.lastCookieCPS = currentCookieCPS;
        }

        if (FrozenCookies.lastUpgradeCount != currentUpgradeCount) {
            FrozenCookies.recalculateCaches = true;
            FrozenCookies.lastUpgradeCount = currentUpgradeCount;
        }
        recalcCount += 1;
    } while (FrozenCookies.recalculateCaches && recalcCount < 10);
}

function doTimeTravel() {
    //  'Time Travel DISABLED','Purchases by Estimated Effective CPS','Purchases by Simulated Real Time','Heavenly Chips by Estimated Effective CPS','Heavenly Chips by Simulated Real Time'
    if (FrozenCookies.timeTravelMethod) {
        // Estimated Effective CPS
        if (timeTravelMethod % 2 === 1) {
            var fullCps = effectiveCps();
            if (fullCps) {
                var neededCookies = 0;
                if (timeTravelMethod === 1) {} else if (timeTravelMethod === 3) {}
            }
        } else {}
    } else {
        FrozenCookies.timeTravelAmount = 0;
    }
    /*
        var fullCps = effectiveCps();
        if (fullCps > 0) {
          var neededCookies = Math.max(0, recommendation.cost + delayAmount() - Game.cookies);
          var time = neededCookies / fullCps;
          Game.Earn(neededCookies);
          Game.startDate -= time * 1000;
          Game.fullDate -= time * 1000;
          FrozenCookies.timeTravelPurchases -= 1;
          logEvent('Time travel', 'Travelled ' + timeDisplay(time) + ' into the future.');
        }
      */
}

//Why the hell is fcWin being called so often? It seems to be getting called repeatedly on the CPS achievements,
//which should only happen when you actually win them?
function fcWin(what) {
    if (typeof what === "string") {
        if (Game.Achievements[what]) {
            if (Game.Achievements[what].won == 0) {
                var achname = Game.Achievements[what].shortName ?
                    Game.Achievements[what].shortName :
                    Game.Achievements[what].name;
                Game.Achievements[what].won = 1;
                //This happens a ton of times on CPS achievements; it seems like they would be CHECKED for, but a degbug message placed
                //here gets repeatedly called seeming to indicate that the achievements.won value is 1, even though the achievement isn't
                //being unlocked. This also means that placing a function to log the achievement spams out messages. Are the Achievement.won
                //values being turned off before the game checks again? There must be some reason Game.Win is replaced with fcWin
                if (!FrozenCookies.disabledPopups) {
                    logEvent(
                        "Achievement",
                        "Achievement unlocked :<br>" +
                        Game.Achievements[what].name +
                        "<br> ",
                        true
                    );
                }
                if (FrozenCookies.showAchievements) {
                    Game.Notify(
                        "Achievement unlocked",
                        '<div class="title" style="font-size:18px;margin-top:-2px;">' +
                        achname +
                        "</div>",
                        Game.Achievements[what].icon
                    );
                    if (App && Game.Achievements[what].vanilla) App.gotAchiev(Game.Achievements[what].id);
                }
                if (Game.Achievements[what].pool != "shadow") {
                    Game.AchievementsOwned++;
                }
                Game.recalculateGains = 1;
            }
        }
    } else {
        logEvent("fcWin Else condition");
        for (var i in what) {
            Game.Win(what[i]);
        }
    }
}

function logEvent(event, text, popup) {
    var time = "[" + timeDisplay((Date.now() - Game.startDate) / 1000) + "]";
    var output = time + " " + event + ": " + text;
    if (FrozenCookies.logging) {
        console.log(output);
    }
    if (popup) {
        Game.Popup(text);
    }
}

function inRect(x, y, rect) {
    // Duplicate of internally defined method,
    // only needed because I'm modifying the scope of Game.UpdateWrinklers and it can't see this anymore.
    var dx = x + Math.sin(-rect.r) * -(rect.h / 2 - rect.o),
        dy = y + Math.cos(-rect.r) * -(rect.h / 2 - rect.o);
    var h1 = Math.sqrt(dx * dx + dy * dy);
    var currA = Math.atan2(dy, dx);
    var newA = currA - rect.r;
    var x2 = Math.cos(newA) * h1;
    var y2 = Math.sin(newA) * h1;
    return (
        x2 > -0.5 * rect.w &&
        x2 < 0.5 * rect.w &&
        y2 > -0.5 * rect.h &&
        y2 < 0.5 * rect.h
    );
}

function transpose(a) {
    return Object.keys(a[0]).map(function(c) {
        return a.map(function(r) {
            return r[c];
        });
    });
}

function smartTrackingStats(delay) {
    saveStats();
    if (FrozenCookies.trackStats == 6) {
        delay /=
            FrozenCookies.delayPurchaseCount == 0 ?
            1 / 1.5 :
            delay > FrozenCookies.minDelay ?
            2 :
            1;
        FrozenCookies.smartTrackingBot = setTimeout(function() {
            smartTrackingStats(delay);
        }, delay);
        FrozenCookies.delayPurchaseCount = 0;
    }
}

// Unused
function shouldClickGC() {
    for (var i in Game.shimmers) {
        if (Game.shimmers[i].type == "golden") {
            return Game.shimmers[i].life > 0 && FrozenCookies.autoGC;
        }
    }
}

function liveWrinklers() {
    return _.select(Game.wrinklers, function(w) {
        return w.sucked > 0.5 && w.phase > 0;
    }).sort(function(w1, w2) {
        return w1.sucked < w2.sucked;
    });
}

function wrinklerMod(num) {
    return (
        1.1 * num * num * 0.05 * (Game.Has("Wrinklerspawn") ? 1.05 : 1) +
        (1 - 0.05 * num)
    );
}

function popValue(w) {
    var toSuck = 1.1;
    if (Game.Has("Sacrilegious corruption")) toSuck *= 1.05;
    if (w.type == 1) toSuck *= 3; //shiny wrinklers are an elusive, profitable breed
    var sucked = w.sucked * toSuck; //cookie dough does weird things inside wrinkler digestive tracts
    if (Game.Has("Wrinklerspawn")) sucked *= 1.05;
    return sucked;
}

function shouldPopWrinklers() {
    var toPop = [];
    var living = liveWrinklers();
    if (living.length > 0) {
        if ((Game.season == "halloween" || Game.season == "easter") && !haveAll(Game.season)) {
            toPop = living.map(function(w) {
                return w.id;
            });
        } else {
            var delay = delayAmount();
            var wrinklerList =
                FrozenCookies.shinyPop == 0 ?
                Game.wrinklers.filter(v >= v.type == 0) :
                Game.wrinklers;
            var nextRecNeeded = nextPurchase().cost + delay - Game.cookies;
            var nextRecCps = nextPurchase().delta_cps;
            var wrinklersNeeded = wrinklerList
                .sort(function(w1, w2) {
                    return w1.sucked < w2.sucked;
                })
                .reduce(
                    function(current, w) {
                        var futureWrinklers = living.length - (current.ids.length + 1);
                        if (
                            current.total < nextRecNeeded &&
                            effectiveCps(delay, Game.elderWrath, futureWrinklers) +
                            nextRecCps >
                            effectiveCps()
                        ) {
                            current.ids.push(w.id);
                            current.total += popValue(w);
                        }
                        return current;
                    }, {
                        total: 0,
                        ids: [],
                    }
                );
            toPop =
                wrinklersNeeded.total > nextRecNeeded ? wrinklersNeeded.ids : toPop;
        }
    }
    return toPop;
}

function autoFrenzyClick() {
    if (hasClickBuff() && !FrozenCookies.autoFrenzyBot) {
        if (FrozenCookies.autoclickBot) {
            clearInterval(FrozenCookies.autoclickBot);
            FrozenCookies.autoclickBot = 0;
        }
        FrozenCookies.autoFrenzyBot = setInterval(
            fcClickCookie,
            1000 / FrozenCookies.frenzyClickSpeed
        );
    } else if (!hasClickBuff() && FrozenCookies.autoFrenzyBot) {
        clearInterval(FrozenCookies.autoFrenzyBot);
        FrozenCookies.autoFrenzyBot = 0;
        if (FrozenCookies.autoClick && FrozenCookies.cookieClickSpeed) {
            FrozenCookies.autoclickBot = setInterval(
                fcClickCookie,
                1000 / FrozenCookies.cookieClickSpeed
            );
        }
    }
}

function autoGSBuy() {
    if (hasClickBuff()) {
        if (
            Game.Upgrades["Golden switch [off]"].unlocked &&
            !Game.Upgrades["Golden switch [off]"].bought
        ) {
            Game.Upgrades["Golden switch [off]"].buy();
        }
    } else if (!hasClickBuff()) {
        if (
            Game.Upgrades["Golden switch [on]"].unlocked &&
            !Game.Upgrades["Golden switch [on]"].bought
        ) {
            Game.CalculateGains(); // Ensure price is updated since Frenzy ended
            Game.Upgrades["Golden switch [on]"].buy();
        }
    }
}

function safeBuy(bldg, count) {
    // If store is in Sell mode, Game.Objects[].buy will sell the building!
    if (Game.buyMode == -1) {
        Game.buyMode = 1;
        bldg.buy(count);
        Game.buyMode = -1;
    } else {
        bldg.buy(count);
    }
}

function autoGodzamokAction() {
    if (T && FrozenCookies.autoGodzamok) {
        // Break if not at least 10 of each building
        if (Game.Objects["Mine"].amount <= 10 || Game.Objects["Factory"].amount <= 10) {
            return;
        }

        // if Pantheon is here and autoGodzamok is set
        if (
            Game.hasGod("ruin") &&
            (Game.Objects["Mine"].amount > 10 && Game.Objects["Mine"].amount < 500)
        ) {
            var countMine = Game.Objects["Mine"].amount;
        } else if (
            Game.hasGod("ruin") && Game.Objects["Mine"].amount >= 500
        ) {
            var countMine = 500;
        } else {
            return;
        }

        if (
            Game.hasGod("ruin") &&
            (Game.Objects["Factory"].amount > 10 && Game.Objects["Factory"].amount < 500)
        ) {
            var countFactory = Game.Objects["Factory"].amount;
        } else if (
            Game.hasGod("ruin") && Game.Objects["Factory"].amount >= 500
        ) {
            var countFactory = 500;
        } else {
            return;
        }

        //Automatically sell up to 500 mines and factories during Dragonflight and Click Frenzy if you worship Godzamok and prevent rapid buy/sell spam
        if (
            FrozenCookies.autoGodzamok >= 1 &&
            hasClickBuff() &&
            !Game.hasBuff("Devastation")
        ) {
            Game.Objects["Mine"].sell(countMine);
            Game.Objects["Factory"].sell(countFactory);

            if (
                (FrozenCookies.mineLimit == 0 ||
                    (Game.Objects["Mine"].amount + countMine) <= FrozenCookies.mineMax)
            ) {
                safeBuy(Game.Objects["Mine"], countMine);
                logEvent("AutoGodzamok", "Bought " + countMine + " mines");
            }

            if (
                (FrozenCookies.factoryLimit == 0 ||
                    (Game.Objects["Factory"].amount + countFactory) <= FrozenCookies.factoryMax)
            ) {
                safeBuy(Game.Objects["Factory"], countFactory);
                logEvent("AutoGodzamok", "Bought " + countFactory + " factories");
            }
        }
    }
}

function goldenCookieLife() {
    for (var i in Game.shimmers) {
        if (Game.shimmers[i].type == "golden") {
            return Game.shimmers[i].life;
        }
    }
    return null;
}

function reindeerLife() {
    for (var i in Game.shimmers) {
        if (Game.shimmers[i].type == "reindeer") {
            return Game.shimmers[i].life;
        }
    }
    return null;
}

function fcClickCookie() {
    if (!Game.OnAscend && !Game.AscendTimer && !Game.specialTabHovered) {
        Game.ClickCookie();
    }
}

function autoCookie() {
    //console.log('autocookie called');
    if (!FrozenCookies.processing && !Game.OnAscend && !Game.AscendTimer) {
        FrozenCookies.processing = true;
        var currentHCAmount = Game.HowMuchPrestige(
            Game.cookiesEarned + Game.cookiesReset + wrinklerValue()
        );

        if (Math.floor(FrozenCookies.lastHCAmount) < Math.floor(currentHCAmount)) {
            var changeAmount = currentHCAmount - FrozenCookies.lastHCAmount;
            FrozenCookies.lastHCAmount = currentHCAmount;
            FrozenCookies.prevLastHCTime = FrozenCookies.lastHCTime;
            FrozenCookies.lastHCTime = Date.now();
            var currHCPercent =
                (60 * 60 * (FrozenCookies.lastHCAmount - Game.heavenlyChips)) /
                ((FrozenCookies.lastHCTime - Game.startDate) / 1000);
            if (
                Game.heavenlyChips < currentHCAmount - changeAmount &&
                currHCPercent > FrozenCookies.maxHCPercent
            ) {
                FrozenCookies.maxHCPercent = currHCPercent;
            }
            FrozenCookies.hc_gain += changeAmount;
        }
        updateCaches();
        var recommendation = nextPurchase();
        var delay = delayAmount();
        if (FrozenCookies.timeTravelAmount) {
            doTimeTravel();
        }
        if (FrozenCookies.autoSL) {
            var started = Game.lumpT;
            var ripeAge = Math.ceil(Game.lumpRipeAge);
            if (Date.now() - started >= ripeAge) {
                Game.clickLump();
            }
        }
        if (FrozenCookies.autoSL == 2) autoRigidel();
        if (FrozenCookies.autoWrinkler == 1) {
            var popCount = 0;
            var popList = shouldPopWrinklers();
            _.filter(Game.wrinklers, function(w) {
                return _.contains(popList, w.id);
            }).forEach(function(w) {
                w.hp = 0;
                popCount += 1;
            });
            if (popCount > 0) {
                logEvent("Wrinkler", "Popped " + popCount + " wrinklers.");
            }
        }
        if (FrozenCookies.autoWrinkler == 2) {
            var popCount = 0;
            var popList = Game.wrinklers;
            popList.forEach(function(w) {
                if (w.close == true) {
                    w.hp = 0;
                    popCount += 1;
                }
            });
            if (popCount > 0) {
                logEvent("Wrinkler", "Popped " + popCount + " wrinklers.");
            }
        }

        var itemBought = false;

        //var seConditions = (Game.cookies >= delay + recommendation.cost) || (!(FrozenCookies.autoSpell == 3) && !(FrozenCookies.holdSEBank))); //true == good on SE bank or don't care about it
        if (
            FrozenCookies.autoBuy &&
            (Game.cookies >= delay + recommendation.cost ||
                recommendation.purchase.name == "Elder Pledge") &&
            (FrozenCookies.pastemode || isFinite(nextChainedPurchase().efficiency))
        ) {
            //    if (FrozenCookies.autoBuy && (Game.cookies >= delay + recommendation.cost)) {
            //console.log('something should get bought');
            recommendation.time = Date.now() - Game.startDate;
            //      full_history.push(recommendation);  // Probably leaky, maybe laggy?
            recommendation.purchase.clickFunction = null;
            disabledPopups = false;
            //      console.log(purchase.name + ': ' + Beautify(recommendation.efficiency) + ',' + Beautify(recommendation.delta_cps));
            if (recommendation.type == "building") {
                safeBuy(recommendation.purchase);
            } else {
                recommendation.purchase.buy();
            }
            FrozenCookies.autobuyCount += 1;
            if (FrozenCookies.trackStats == 5 && recommendation.type == "upgrade") {
                saveStats();
            } else if (FrozenCookies.trackStats == 6) {
                FrozenCookies.delayPurchaseCount += 1;
            }
            logEvent(
                "Store",
                "Autobought " +
                recommendation.purchase.name +
                " for " +
                Beautify(recommendation.cost) +
                ", resulting in " +
                Beautify(recommendation.delta_cps) +
                " CPS."
            );
            disabledPopups = true;
            if (FrozenCookies.autobuyCount >= 10) {
                Game.Draw();
                FrozenCookies.autobuyCount = 0;
            }
            FrozenCookies.recalculateCaches = true;
            FrozenCookies.processing = false;
            itemBought = true;
        }

        if (FrozenCookies.autoAscend && !Game.OnAscend && !Game.AscendTimer) {
            var currPrestige = Game.prestige;
            var resetPrestige = Game.HowMuchPrestige(
                Game.cookiesReset +
                Game.cookiesEarned +
                wrinklerValue() +
                chocolateValue()
            );
            var ascendChips = FrozenCookies.HCAscendAmount;
            if (resetPrestige - currPrestige >= ascendChips && ascendChips > 0) {
                Game.ClosePrompt();
                Game.Ascend(1);
                setTimeout(function() {
                    Game.ClosePrompt();
                    Game.Reincarnate(1);
                }, 10000);
            }
        }

        var fps_amounts = [
            "15",
            "24",
            "30",
            "48",
            "60",
            "72",
            "88",
            "100",
            "120",
            "144",
            "200",
            "240",
            "300",
            "5",
            "10",
        ];
        if (parseInt(fps_amounts[FrozenCookies["fpsModifier"]]) != Game.fps) {
            Game.fps = parseInt(fps_amounts[FrozenCookies["fpsModifier"]]);
        }

        // This apparently *has* to stay here, or else fast purchases will multi-click it.
        if (goldenCookieLife() && FrozenCookies.autoGC) {
            for (var i in Game.shimmers) {
                if (Game.shimmers[i].type == "golden") {
                    Game.shimmers[i].pop();
                }
            }
        }
        if (reindeerLife() > 0 && FrozenCookies.autoReindeer) {
            for (var i in Game.shimmers) {
                if (Game.shimmers[i].type == "reindeer") {
                    Game.shimmers[i].pop();
                }
            }
        }
        if (FrozenCookies.autoBlacklistOff) {
            autoBlacklistOff();
        }
        var currentFrenzy = cpsBonus() * clickBuffBonus();
        if (currentFrenzy != FrozenCookies.last_gc_state) {
            if (FrozenCookies.last_gc_state != 1 && currentFrenzy == 1) {
                logEvent("GC", "Frenzy ended, cookie production x1");
                if (FrozenCookies.hc_gain) {
                    logEvent(
                        "HC",
                        "Won " +
                        FrozenCookies.hc_gain +
                        " heavenly chips during Frenzy. Rate: " +
                        (FrozenCookies.hc_gain * 1000) /
                        (Date.now() - FrozenCookies.hc_gain_time) +
                        " HC/s."
                    );
                    FrozenCookies.hc_gain_time = Date.now();
                    FrozenCookies.hc_gain = 0;
                }
            } else {
                if (FrozenCookies.last_gc_state != 1) {
                    logEvent(
                        "GC",
                        "Previous Frenzy x" + FrozenCookies.last_gc_state + "interrupted."
                    );
                } else if (FrozenCookies.hc_gain) {
                    logEvent(
                        "HC",
                        "Won " +
                        FrozenCookies.hc_gain +
                        " heavenly chips outside of Frenzy. Rate: " +
                        (FrozenCookies.hc_gain * 1000) /
                        (Date.now() - FrozenCookies.hc_gain_time) +
                        " HC/s."
                    );
                    FrozenCookies.hc_gain_time = Date.now();
                    FrozenCookies.hc_gain = 0;
                }
                logEvent(
                    "GC",
                    "Starting " +
                    (hasClickBuff() ? "Clicking " : "") +
                    "Frenzy x" +
                    currentFrenzy
                );
            }
            if (FrozenCookies.frenzyTimes[FrozenCookies.last_gc_state] == null) {
                FrozenCookies.frenzyTimes[FrozenCookies.last_gc_state] = 0;
            }
            FrozenCookies.frenzyTimes[FrozenCookies.last_gc_state] +=
                Date.now() - FrozenCookies.last_gc_time;
            FrozenCookies.last_gc_state = currentFrenzy;
            FrozenCookies.last_gc_time = Date.now();
        }
        FrozenCookies.processing = false;
        if (FrozenCookies.frequency) {
            FrozenCookies.cookieBot = setTimeout(
                autoCookie,
                itemBought ? 0 : FrozenCookies.frequency
            );
        }
    } else if (!FrozenCookies.processing && FrozenCookies.frequency) {
        FrozenCookies.cookieBot = setTimeout(
            autoCookie,
            FrozenCookies.frequency
        );
    }
}

function FCStart() {
    //  To allow polling frequency to change, clear intervals before setting new ones.

    if (FrozenCookies.cookieBot) {
        clearInterval(FrozenCookies.cookieBot);
        FrozenCookies.cookieBot = 0;
    }
    if (FrozenCookies.autoclickBot) {
        clearInterval(FrozenCookies.autoclickBot);
        FrozenCookies.autoclickBot = 0;
    }
    if (FrozenCookies.statBot) {
        clearInterval(FrozenCookies.statBot);
        FrozenCookies.statBot = 0;
    }

    if (FrozenCookies.autoGSBot) {
        clearInterval(FrozenCookies.autoGSBot);
        FrozenCookies.autoGSBot = 0;
    }

    if (FrozenCookies.autoGodzamokBot) {
        clearInterval(FrozenCookies.autoGodzamokBot);
        FrozenCookies.autoGodzamokBot = 0;
    }
    if (FrozenCookies.autoSpellBot) {
        clearInterval(FrozenCookies.autoSpellBot);
        FrozenCookies.autoSpellBot = 0;
    }
    if (FrozenCookies.autoFortuneBot) {
        clearInterval(FrozenCookies.autoFortuneBot);
        FrozenCookies.autoFortuneBot = 0;
    }

    if (FrozenCookies.autoFTHOFComboBot) {
        clearInterval(FrozenCookies.autoFTHOFComboBot);
        FrozenCookies.autoFTHOFComboBot = 0;
    }

    if (FrozenCookies.auto100ConsistencyComboBot) {
        clearInterval(FrozenCookies.auto100ConsistencyComboBot);
        FrozenCookies.auto100ConsistencyComboBot = 0;
    }

    if (FrozenCookies.autoEasterBot) {
        clearInterval(FrozenCookies.autoEasterBot);
        FrozenCookies.autoEasterBot = 0;
    }

    if (FrozenCookies.autoHalloweenBot) {
        clearInterval(FrozenCookies.autoHalloweenBot);
        FrozenCookies.autoHalloweenBot = 0;
    }

    if (FrozenCookies.autoBrokerBot) {
        clearInterval(FrozenCookies.autoBrokerBot);
        FrozenCookies.autoBrokerBot = 0;
    }

    if (FrozenCookies.autoDragonBot) {
        clearInterval(FrozenCookies.autoDragonBot);
        FrozenCookies.autoDragonBot = 0;
    }

    if (FrozenCookies.petDragonBot) {
        clearInterval(FrozenCookies.petDragonBot);
        FrozenCookies.petDragonBot = 0;
    }

    if (FrozenCookies.autoLoanBot) {
        clearInterval(FrozenCookies.autoLoanBot);
        FrozenCookies.autoLoanBot = 0;
    }

    // Remove until timing issues are fixed
    //  if (FrozenCookies.goldenCookieBot) {
    //    clearInterval(FrozenCookies.goldenCookieBot);
    //    FrozenCookies.goldenCookieBot = 0;
    //  }

    // Now create new intervals with their specified frequencies.

    if (FrozenCookies.frequency) {
        FrozenCookies.cookieBot = setTimeout(
            autoCookie,
            FrozenCookies.frequency
        );
    }

    /*if (FrozenCookies.autoGC) {
          FrozenCookies.goldenCookieBot = setInterval(
            autoGoldenCookie, 
            FrozenCookies.frequency
          );
      }*/

    if (FrozenCookies.autoClick && FrozenCookies.cookieClickSpeed) {
        FrozenCookies.autoclickBot = setInterval(
            fcClickCookie,
            1000 / FrozenCookies.cookieClickSpeed
        );
    }

    if (FrozenCookies.autoFrenzy && FrozenCookies.frenzyClickSpeed) {
        FrozenCookies.frenzyClickBot = setInterval(
            autoFrenzyClick,
            FrozenCookies.frequency
        );
    }

    if (FrozenCookies.autoGS) {
        FrozenCookies.autoGSBot = setInterval(
            autoGSBuy,
            FrozenCookies.frequency
        );
    }

    if (FrozenCookies.autoGodzamok) {
        FrozenCookies.autoGodzamokBot = setInterval(
            autoGodzamokAction,
            FrozenCookies.frequency
        );
    }

    if (FrozenCookies.autoSpell) {
        FrozenCookies.autoSpellBot = setInterval(
            autoCast,
            FrozenCookies.frequency * 10
        );
    }

    if (FrozenCookies.autoFortune) {
        FrozenCookies.autoFortuneBot = setInterval(
            autoTicker,
            FrozenCookies.frequency * 10
        );
    }

    if (FrozenCookies.autoFTHOFCombo) {
        FrozenCookies.autoFTHOFComboBot = setInterval(
            autoFTHOFComboAction,
            FrozenCookies.frequency * 2
        );
    }

    if (FrozenCookies.auto100ConsistencyCombo) {
        FrozenCookies.auto100ConsistencyComboBot = setInterval(
            auto100ConsistencyComboAction,
            FrozenCookies.frequency * 2
        );
    }

    if (FrozenCookies.autoEaster) {
        FrozenCookies.autoEasterBot = setInterval(
            autoEasterAction,
            FrozenCookies.frequency
        );
    }

    if (FrozenCookies.autoHalloween) {
        FrozenCookies.autoHalloweenBot = setInterval(
            autoHalloweenAction,
            FrozenCookies.frequency
        );
    }

    if (FrozenCookies.autoBroker) {
        FrozenCookies.autoBrokerBot = setInterval(
            autoBrokerAction,
            FrozenCookies.frequency
        );
    }

    if (FrozenCookies.autoDragon) {
        FrozenCookies.autoDragonBot = setInterval(
            autoDragonAction,
            FrozenCookies.frequency
        );
    }

    if (FrozenCookies.petDragon) {
        FrozenCookies.petDragonBot = setInterval(
            petDragonAction,
            FrozenCookies.frequency * 2
        );
    }

    if (FrozenCookies.autoLoan) {
        FrozenCookies.autoLoanBot = setInterval(
            autoLoanBuy,
            FrozenCookies.frequency
        );
    }

    if (statSpeed(FrozenCookies.trackStats) > 0) {
        FrozenCookies.statBot = setInterval(
            saveStats,
            statSpeed(FrozenCookies.trackStats)
        );
    } else if (FrozenCookies.trackStats == 6 && !FrozenCookies.smartTrackingBot) {
        FrozenCookies.smartTrackingBot = setTimeout(function() {
            smartTrackingStats(FrozenCookies.minDelay * 8);
        }, FrozenCookies.minDelay);
    }

    FCMenu();
}
