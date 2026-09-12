$(function () {
  "use strict";

  // The CV in reading order, one entry per page. Sections that outgrow a
  // single page are split across numbered files (experience_page_1, _2, …) —
  // a page has a fixed height, so content that does not fit gets clipped.
  // Add a page here and it is paired into a spread automatically.
  var PAGES = [
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

  var BLANK = null; // trailing filler when the page count is odd

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

  // A blank filler page carries no content and no page number.
  function faceOf(index, side) {
    var url = SPREADS[index][side];

    return {
      html: url ? cache[url] : "",
      number: url ? index * 2 + (side === "left" ? 1 : 2) : ""
    };
  }

  function setPage($page, face) {
    $page.find(".content").html(face.html);
    $page.find(".pagination").text(face.number);
  }

  function render(index) {
    setPage($left, faceOf(index, "left"));
    setPage($right, faceOf(index, "right"));
    syncControls();
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
  function buildLeaf(forward, front, back) {
    function face(cls, html, number) {
      return (
        '<div class="flip-face ' + cls + '">' +
        '<div class="content">' + html + "</div>" +
        '<div class="pagination">' + number + "</div>" +
        '<div class="flip-shade"></div>' +
        "</div>"
      );
    }

    return $(
      '<div class="flip-leaf ' + (forward ? "forward" : "backward") + '" aria-hidden="true">' +
        face("front", front.html, front.number) +
        face("back", back.html, back.number) +
        "</div>"
    );
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

    // Put the destination page underneath straight away — the leaf covers it
    // at rest, so it is only revealed as the sheet lifts off.
    if (forward) {
      setPage($right, faceOf(target, "right"));
    } else {
      setPage($left, faceOf(target, "left"));
    }

    var $leaf = buildLeaf(forward, front, back);
    $book.append($leaf);

    // Commit the start transform before switching to the end one, or the
    // browser collapses both into a single frame and nothing animates.
    void $leaf[0].offsetWidth;
    $leaf.addClass("is-turning");

    window.setTimeout(function () {
      // The leaf has landed; the half it came to rest on takes over its back
      // face, then the leaf is discarded.
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
      .done(function (html) { cache[url] = html; })
      .fail(function () { cache[url] = errorMarkup(url); })
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
