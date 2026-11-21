// Intentionally minimal: the site is static HTML and CSS. The only thing that
// needs a script is the breadcrumb back button, which is pointless (and should
// look it) when the visitor landed here directly.
document.addEventListener("DOMContentLoaded", () => {
  const back = document.querySelector(".crumb-back");
  if (back) back.disabled = history.length <= 1;
});
