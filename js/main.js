document.documentElement.classList.add("js");

(function () {
  var header = document.querySelector("[data-header]");
  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");
  var label = document.querySelector("[data-nav-label]");

  function onScroll() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  function closeNav() {
    if (!nav || !toggle) return;
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-open");
    if (label) label.textContent = "Menu";
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("is-open", !open);
      document.body.classList.toggle("nav-open", !open);
      if (label) label.textContent = open ? "Menu" : "Close";
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closeNav);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeNav();
    });
  }

  document.querySelectorAll("[data-faq]").forEach(function (item) {
    var button = item.querySelector("button");
    var panel = item.querySelector("[data-faq-panel]");
    button.addEventListener("click", function () {
      var open = button.getAttribute("aria-expanded") === "true";
      document.querySelectorAll("[data-faq]").forEach(function (other) {
        var otherButton = other.querySelector("button");
        var otherPanel = other.querySelector("[data-faq-panel]");
        if (otherButton !== button) {
          otherButton.setAttribute("aria-expanded", "false");
          otherPanel.hidden = true;
        }
      });
      button.setAttribute("aria-expanded", String(!open));
      panel.hidden = open;
    });
  });

  var form = document.querySelector("[data-enquire]");
  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var name = String(data.get("name") || "").trim();
      var email = String(data.get("email") || "").trim();
      var phone = String(data.get("phone") || "").trim();
      var home = String(data.get("home") || "").trim();
      var message = "";
      if (name.length < 2) message = "Please enter your name.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) message = "Please enter a valid email address.";
      else if (phone.replace(/\D/g, "").length < 7) message = "Please enter a phone number.";
      else if (!home) message = "Please choose a home type.";

      var error = form.querySelector("[data-form-error]");
      var success = form.querySelector("[data-form-success]");
      var fields = form.querySelector("[data-form-fields]");
      if (message) {
        error.hidden = false;
        error.textContent = message;
        return;
      }
      error.hidden = true;
      fields.hidden = true;
      success.hidden = false;
      success.focus();
    });
  }

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var nodes = document.querySelectorAll(".reveal");
  if (reduce || !("IntersectionObserver" in window)) {
    nodes.forEach(function (node) { node.classList.add("is-in"); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-in");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  nodes.forEach(function (node) { observer.observe(node); });
})();
