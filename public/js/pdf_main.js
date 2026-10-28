$(function () {
  "use strict";

  // Flat reading order — the screen view splits these across left/right halves
  // of a spread; on paper they are simply consecutive sheets. Keep this list
  // in step with PAGES in main.js.
  var COVER = "pages/cover.html";

  var PAGES = [
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

  var $doc = $("#pdf-doc");

  // Build every sheet up front so the DOM order is correct, then fill them in.
  // Waiting for all of them keeps the print dialog from opening on a half-
  // rendered document.
  // The cover is full-bleed and unnumbered, so numbering starts on the sheet
  // after it — matching the book view, where the profile is page 1.
  var numbered = 0;

  var loads = PAGES.map(function (url) {
    var isCover = url === COVER;

    var $sheet = $("<article class='sheet'></article>")
      .toggleClass("is-cover", isCover)
      .attr("data-page", isCover ? "" : String(++numbered));

    $doc.append($sheet);

    return $.Deferred(function (d) {
      $sheet.load(url, function (response, status) {
        if (status === "error") {
          $sheet.html(
            "<div class='load-error'><h3>Couldn&rsquo;t load this page</h3><p>" +
              url +
              " could not be fetched.</p></div>"
          );
        }
        d.resolve();
      });
    }).promise();
  });

  $("#print-cv").on("click", function () {
    window.print();
  });

  // ?print=1 opens the dialog automatically once every sheet has rendered.
  if (/[?&]print=1\b/.test(window.location.search)) {
    $.when.apply($, loads).done(function () {
      window.setTimeout(function () {
        window.print();
      }, 300);
    });
  }
});
