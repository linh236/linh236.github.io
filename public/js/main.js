$(function () {
  "use strict";

  var BLANK = null;  // a leaf with nothing on that side
  var COVER = "pages/cover.html";
  var BACK_COVER = "pages/thank_you.html";

  function isCover(url) {
    return url === COVER || url === BACK_COVER;
  }

  // The CV in reading order, one entry per page. Sections that outgrow a
  // single page are split across numbered files (experience_page_1, _2, …) —
  // a page has a fixed height, so content that does not fit gets clipped.
  // Add a page here and it is paired into a spread automatically.
  //
  // The list opens on a blank facing the cover. That first "spread" is the
  // closed book: nothing to the left of a front cover, so the left half is
  // hidden and the cover sits centred. Turning it is an ordinary page turn —
  // the cover is the front of the leaf and page 1 is its back — which is
  // precisely how a book opens.
  var PAGES = [
    BLANK,
    COVER,
    "pages/infor.html",
    "pages/skill_page_1.html",
    "pages/skill_page_2.html",
    "pages/experience_page_1.html",
    "pages/experience_page_2.html",
    "pages/experience_page_3.html",
    "pages/my_project.html",
    "pages/additional.html",
    "pages/thank_you.html"
  ];

  // A book prints no number on its cover, so numbering starts after it and
  // the profile is page 1.
  var PAGE_NUMBER = (function () {
    var map = {};
    var n = 0;

    PAGES.forEach(function (url) {
      if (!url) return;
      map[url] = isCover(url) ? "" : String(++n);
    });

    return map;
  })();

  // Pages are read two at a time, so fold the flat list into spreads. An odd
  // final page gets a blank facing page, exactly as a printed book would.
  var SPREADS = (function () {
    var out = [];
    for (var i = 0; i < PAGES.length; i += 2) {
      out.push({ left: PAGES[i], right: i + 1 < PAGES.length ? PAGES[i + 1] : BLANK });
    }
    return out;
  })();

  var FLIP_MS = 900; // keep in step with --flip-ms in _book.scss

  var $book = $(".book");
  var $left = $(".page.left");
  var $right = $(".page.right");
  var $prev = $(".nav-left");
  var $next = $(".nav-right");
  var $dots = $(".book-progress");

  var current = 0;
  var flipping = false;
  var cache = {};

  // --- Where you are, kept in the URL -----------------------------------
  // The spread lives in the hash (#spread-3), so a refresh reopens the page
  // you were on and the URL can be shared or bookmarked straight to a spread.

  function clampSpread(n) {
    if (isNaN(n)) return 0;
    return Math.min(Math.max(n, 0), SPREADS.length - 1);
  }

  function spreadFromHash() {
    var m = /spread-(\d+)/.exec(window.location.hash);
    // The hash is 1-based for readability; the index is 0-based.
    return m ? clampSpread(parseInt(m[1], 10) - 1) : 0;
  }

  // replaceState rather than assigning location.hash: it keeps the URL in step
  // without stacking a history entry per turn (and without firing hashchange,
  // which would bounce straight back into goTo).
  function writeHash(index) {
    var hash = "#spread-" + (index + 1);
    if (window.location.hash === hash) return;

    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", hash);
    } else {
      window.location.hash = hash;
    }
  }

  // Served over file:// the fragments cannot be fetched, which previously left
  // the book silently blank. Explain it instead.
  var FILE_PROTOCOL_HELP =
    '<div class="load-error">' +
    "<h3>Pages can&rsquo;t be loaded from the filesystem</h3>" +
    "<p>The browser blocks fetching these page fragments when the CV is opened " +
    "directly as a file. Serve the folder over HTTP instead:</p>" +
    "<p><code>npm start</code> &nbsp;then open&nbsp; <code>http://localhost:8080</code></p>" +
    "</div>";

  function errorMarkup(url) {
    if (window.location.protocol === "file:") return FILE_PROTOCOL_HELP;
    return (
      '<div class="load-error"><h3>Couldn&rsquo;t load this page</h3><p>' +
      url +
      " could not be fetched.</p></div>"
    );
  }

  function stacked() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Each page's markup is parsed once, at load, into a detached node. Turning
  // a page then clones that node instead of re-parsing a page of HTML — the
  // parse was landing right as the animation started, which is exactly when
  // there are no spare milliseconds.
  function template(html) {
    var el = document.createElement("div");
    el.innerHTML = html;
    return el;
  }

  // A blank filler page carries no content and no page number.
  function faceOf(index, side) {
    var url = SPREADS[index][side];

    return {
      node: url && cache[url] ? cache[url].cloneNode(true) : null,
      number: url ? PAGE_NUMBER[url] : "",
      cover: isCover(url)
    };
  }

  function fillContent(contentEl, node) {
    contentEl.textContent = "";
    if (!node) return;

    // Move the clone's children across rather than re-serialising them.
    while (node.firstChild) contentEl.appendChild(node.firstChild);
  }

  function setPage($page, face) {
    fillContent($page.find(".content")[0], face.node);
    $page.find(".pagination").text(face.number);
    // The cover is full-bleed, so its page gives up the paper padding.
    $page.toggleClass("is-cover", !!face.cover);
    $page.toggleClass("is-blank", !face.node);
  }

  function render(index) {
    setPage($left, faceOf(index, "left"));
    setPage($right, faceOf(index, "right"));
    setClosed(index);
    syncControls();
  }

  // The book is shut at either end: the front cover has nothing to its left,
  // the back cover nothing to its right.
  function setClosed(index) {
    var last = SPREADS.length - 1;

    $book.toggleClass("is-closed", index === 0 && !SPREADS[0].left);
    $book.toggleClass("is-closed-back", index === last && !SPREADS[last].right);
  }

  // Takes an explicit index so the controls can update the moment a turn
  // starts, rather than lagging behind the animation.
  function syncControls(index) {
    var at = index === undefined ? current : index;

    $prev.prop("disabled", at === 0);
    $next.prop("disabled", at === SPREADS.length - 1);

    $dots.children().each(function (i) {
      $(this).attr("aria-current", i === at ? "true" : "false");
    });
  }

  // One leaf, two faces. `front` is what the reader is looking at now; `back`
  // is what ends up face-up once the sheet has turned all the way over.
  // Built with DOM calls rather than an HTML string so the page content can be
  // dropped in as an already-parsed clone.
  function buildLeaf(forward, front, back) {
    function face(cls, side) {
      var el = document.createElement("div");
      el.className = "flip-face " + cls + (side.cover ? " is-cover" : "");

      var content = document.createElement("div");
      content.className = "content";
      fillContent(content, side.node);

      var num = document.createElement("div");
      num.className = "pagination";
      num.textContent = side.number;

      var shade = document.createElement("div");
      shade.className = "flip-shade";

      el.appendChild(content);
      el.appendChild(num);
      el.appendChild(shade);
      return el;
    }

    var leaf = document.createElement("div");
    leaf.className = "flip-leaf " + (forward ? "forward" : "backward");
    leaf.setAttribute("aria-hidden", "true");
    leaf.appendChild(face("front", front));
    leaf.appendChild(face("back", back));

    return $(leaf);
  }

  function goTo(target) {
    if (flipping || target === current) return;
    if (target < 0 || target > SPREADS.length - 1) return;

    writeHash(target);

    // No spine to hinge on when stacked, and no animation when the reader has
    // asked for reduced motion — just swap.
    if (stacked() || reducedMotion()) {
      current = target;
      render(current);
      return;
    }


    var forward = target > current;

    var front = forward ? faceOf(current, "right") : faceOf(current, "left");
    var back = forward ? faceOf(target, "left") : faceOf(target, "right");

    flipping = true;
    syncControls(target);
    setClosed(target);

    var $leaf = buildLeaf(forward, front, back);
    $book.append($leaf);

    // The start transform has to be committed before the end one is applied,
    // or the browser collapses both into a single frame and nothing animates.
    // Two frames of waiting does that without forcing a synchronous layout the
    // way reading offsetWidth does — and the leaf has just been built, so that
    // reflow was measuring a whole page of freshly inserted content.
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        $leaf.addClass("is-turning");

        // The destination page goes in underneath only now. At rest the leaf
        // covers this half completely, and it takes several frames to rotate
        // far enough to reveal anything, so the swap is invisible here — and
        // doing it after the click keeps a second page-sized layout off the
        // critical path, where it was costing a dropped frame.
        if (forward) {
          setPage($right, faceOf(target, "right"));
        } else {
          setPage($left, faceOf(target, "left"));
        }

        // Timed from here, not from the click, so the swap lands exactly when
        // the transition ends rather than two frames early.
        window.setTimeout(function () {
          // The leaf has landed; the half it came to rest on takes over its
          // back face, then the leaf is discarded.
          if (forward) {
            setPage($left, faceOf(target, "left"));
          } else {
            setPage($right, faceOf(target, "right"));
          }

          $leaf.remove();
          current = target;
          syncControls();
          flipping = false;
        }, FLIP_MS);
      });
    });
  }

  function buildDots() {
    var markup = SPREADS.map(function (_, i) {
      return (
        '<button type="button" data-index="' + i + '">' +
        '<span class="visually-hidden">Spread ' + (i + 1) + "</span>" +
        "</button>"
      );
    }).join("");

    $dots.html(markup).on("click", "button", function () {
      goTo(parseInt($(this).data("index"), 10));
    });
  }

  $next.on("click", function () { goTo(current + 1); });
  $prev.on("click", function () { goTo(current - 1); });

  $(document).on("keydown", function (e) {
    if (e.key === "ArrowRight") goTo(current + 1);
    if (e.key === "ArrowLeft") goTo(current - 1);
    if (e.key === "Home") goTo(0);
    if (e.key === "End") goTo(SPREADS.length - 1);
  });

  // Someone editing the hash by hand, or following a link to #spread-N while
  // already on the page. Our own updates use replaceState, so they never land
  // here.
  $(window).on("hashchange", function () {
    goTo(spreadFromHash());
  });

  // Every fragment is fetched up front. The leaf needs both of its faces ready
  // at the instant the turn starts, so loading on demand would flash blank.
  var urls = PAGES.slice();

  // Each request is wrapped so it always resolves — otherwise a single 404
  // would reject $.when and render the book before the rest had arrived.
  var requests = urls.map(function (url) {
    var done = $.Deferred();

    $.get(url)
      .done(function (html) { cache[url] = template(html); })
      .fail(function () { cache[url] = template(errorMarkup(url)); })
      .always(function () { done.resolve(); });

    return done.promise();
  });

  buildDots();

  $.when.apply($, requests).done(function () {
    // Reopen wherever the reader left off, and normalise the hash so a bare
    // or out-of-range one (#spread-99) still reflects what is on screen.
    current = spreadFromHash();
    writeHash(current);
    render(current);
  });
});
