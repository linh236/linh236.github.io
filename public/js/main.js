$(function () {
  "use strict";

  var SPREADS = [
    { left: "pages/infor.html",             right: "pages/skill_page_1.html" },
    { left: "pages/skill_page_2.html",      right: "pages/experience_page_1.html" },
    { left: "pages/experience_page_2.html", right: "pages/my_project.html" },
    { left: "pages/additional.html",        right: "pages/thank_you.html" }
  ];

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

  function pageNo(index, side) {
    return index * 2 + (side === "left" ? 1 : 2);
  }

  function setPage($page, html, number) {
    $page.find(".content").html(html);
    $page.find(".pagination").text(number);
  }

  function render(index) {
    var spread = SPREADS[index];
    setPage($left, cache[spread.left], pageNo(index, "left"));
    setPage($right, cache[spread.right], pageNo(index, "right"));
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

    // No spine to hinge on when stacked, and no animation when the reader has
    // asked for reduced motion — just swap.
    if (stacked() || reducedMotion()) {
      current = target;
      render(current);
      return;
    }

    var forward = target > current;
    var from = SPREADS[current];
    var to = SPREADS[target];

    var front = forward
      ? { html: cache[from.right], number: pageNo(current, "right") }
      : { html: cache[from.left],  number: pageNo(current, "left") };

    var back = forward
      ? { html: cache[to.left],  number: pageNo(target, "left") }
      : { html: cache[to.right], number: pageNo(target, "right") };

    flipping = true;
    syncControls(target);

    // Put the destination page underneath straight away — the leaf covers it
    // at rest, so it is only revealed as the sheet lifts off.
    if (forward) {
      setPage($right, cache[to.right], pageNo(target, "right"));
    } else {
      setPage($left, cache[to.left], pageNo(target, "left"));
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
        setPage($left, cache[to.left], pageNo(target, "left"));
      } else {
        setPage($right, cache[to.right], pageNo(target, "right"));
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

  // Every fragment is fetched up front. The leaf needs both of its faces ready
  // at the instant the turn starts, so loading on demand would flash blank.
  var urls = SPREADS.reduce(function (acc, s) {
    return acc.concat(s.left, s.right);
  }, []);

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
    render(current);
  });
});
