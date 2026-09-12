$(function () {
  "use strict";

  // Flat reading order — the screen view splits these across left/right halves
  // of a spread, but on paper they are simply pages 1..8.
  var PAGES = [
    "pages/infor.html",
    "pages/skill_page_1.html",
    "pages/skill_page_2.html",
    "pages/experience_page_1.html",
    "pages/experience_page_2.html",
    "pages/my_project.html",
    "pages/additional.html",
    "pages/thank_you.html"
  ];

  var $doc = $("#pdf-doc");

  // Build every sheet up front so the DOM order is correct, then fill them in.
  // Waiting for all of them keeps the print dialog from opening on a half-
  // rendered document.
  var loads = PAGES.map(function (url, i) {
    var $sheet = $("<article class='sheet'></article>").attr(
      "data-page",
      String(i + 1)
    );

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
