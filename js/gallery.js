/*
 * The layered Endless Color Sort screenshots on the homepage. Three real
 * buttons hold a position each: left, center or right. Choosing a side shot
 * brings it to the center and rotates the other two round, so the layout
 * stays balanced. The caption and labels follow the shot in front.
 *
 * Loaded with defer on the homepage only. Without it the screenshots still
 * show in their starting positions.
 */
(function () {
    var gallery = document.querySelector("[data-gallery]");

    if (!gallery) {
        return;
    }

    var shots = Array.prototype.slice.call(gallery.querySelectorAll(".shot"));
    var caption = gallery.querySelector(".gallery-caption");
    var stage = gallery.querySelector(".stage");

    function at(pos) {
        return shots.filter(function (shot) { return shot.dataset.pos === pos; })[0];
    }

    function describe() {
        shots.forEach(function (shot) {
            var front = shot.dataset.pos === "center";

            shot.setAttribute("aria-label", (front ? "Showing: " : "Bring to front: ") + shot.dataset.title);

            if (front) {
                shot.setAttribute("aria-current", "true");
            } else {
                shot.removeAttribute("aria-current");
            }
        });

        var active = at("center");
        var title = document.createElement("strong");

        title.textContent = active.dataset.title;
        caption.innerHTML = "";
        caption.appendChild(title);
        caption.appendChild(document.createTextNode(active.dataset.description));
    }

    function select(shot) {
        var pos = shot.dataset.pos;

        if (pos === "center") {
            return;
        }

        var left = at("left");
        var center = at("center");
        var right = at("right");

        if (pos === "left") {
            left.dataset.pos = "center";
            center.dataset.pos = "right";
            right.dataset.pos = "left";
        } else {
            right.dataset.pos = "center";
            center.dataset.pos = "left";
            left.dataset.pos = "right";
        }

        describe();
    }

    /* A horizontal swipe on the stage brings the next shot forward. Taps still work. */
    var startX = null;
    var startY = null;
    var swiped = false;

    shots.forEach(function (shot) {
        shot.addEventListener("click", function () {
            if (swiped) {
                swiped = false;
                return;
            }

            select(shot);
        });
    });

    stage.addEventListener("pointerdown", function (event) {
        if (event.pointerType !== "touch") {
            return;
        }

        startX = event.clientX;
        startY = event.clientY;
        swiped = false;
    });

    stage.addEventListener("pointerup", function (event) {
        if (startX === null) {
            return;
        }

        var dx = event.clientX - startX;
        var dy = event.clientY - startY;

        startX = null;

        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            swiped = true;

            /* The click that may follow a swipe is ignored, but only briefly. */
            setTimeout(function () { swiped = false; }, 400);

            select(at(dx < 0 ? "right" : "left"));
        }
    });

    describe();
})();
