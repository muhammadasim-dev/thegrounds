document.documentElement.classList.add("js");

(function () {
  var banner = document.querySelector(".hero-banner");
  var bannerFrame = document.querySelector(".frame--banner");
  if (banner && bannerFrame) {
    banner.addEventListener("loadeddata", function () {
      bannerFrame.classList.add("has-banner-video");
    });
    banner.addEventListener("error", function () {
      bannerFrame.classList.remove("has-banner-video");
    });
    if (banner.readyState >= 2) {
      bannerFrame.classList.add("has-banner-video");
    } else {
      banner.load();
    }
  }

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
      link.addEventListener("click", function (event) {
        if (link.matches("[data-open-enquire]")) return;
        closeNav();
      });
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

  // Ported from offplanproject.ae lib/validation.ts and lib/leads/traffic.ts.
  function formatFullPhone(countryDial, phone) {
    var local = String(phone).replace(/\s/g, "");
    return countryDial + (local.charAt(0) === "0" ? local.slice(1) : local);
  }

  function getTrafficChannel() {
    var params = new URLSearchParams(window.location.search);
    var source = (params.get("utm_source") || "").trim().toLowerCase();
    var medium = (params.get("utm_medium") || "").trim().toLowerCase();
    if (source) {
      if (["cpc", "ppc", "paid", "paidsearch", "display"].indexOf(medium) !== -1) return "paid / " + source;
      if (["email", "newsletter"].indexOf(medium) !== -1) return "email / " + source;
      if (["social", "social-media"].indexOf(medium) !== -1) return "social / " + source;
      return source;
    }
    var referrer = (document.referrer || "").trim();
    if (!referrer) return "direct";
    try {
      var host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
      if (host === window.location.hostname.replace(/^www\./, "")) return "direct";
      if (/google\./i.test(host)) return "organic / google";
      if (/bing\./i.test(host)) return "organic / bing";
      if (/facebook|instagram|linkedin|twitter|x\.com|t\.co|tiktok|youtube|reddit/i.test(host)) return "social / " + host;
      return "referral / " + host;
    } catch (e) {
      return "referral";
    }
  }

  var defaultMessage =
    "I\u2019d like details on The Grounds by Aldar in Dubai Silicon Oasis.";

  function mountEnquireModal() {
    if (document.querySelector("[data-enquire-modal]")) return;
    var root = document.createElement("div");
    root.className = "enquire-modal";
    root.setAttribute("data-enquire-modal", "");
    root.hidden = true;
    root.innerHTML =
      '<button type="button" class="enquire-modal__backdrop" data-enquire-close aria-label="Close registration form"></button>' +
      '<div class="enquire-modal__panel" role="dialog" aria-modal="true" aria-labelledby="enquire-modal-title">' +
      '<button type="button" class="enquire-modal__close" data-enquire-close aria-label="Close">×</button>' +
      '<p class="enquire-modal__eyebrow">Register interest</p>' +
      '<h2 class="enquire-modal__title" id="enquire-modal-title">The Grounds in Dubai Silicon Oasis.</h2>' +
      '<p class="enquire-modal__lede">Share your details and we will follow up with project updates, availability, and next steps.</p>' +
      '<form data-enquire action="#" method="post">' +
      '<div data-form-fields class="enquire-modal__fields">' +
      '<label class="field"><span>Full name</span><input name="name" type="text" autocomplete="name" required></label>' +
      '<label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>' +
      '<label class="field"><span>Phone</span>' +
      '<span class="phone-field">' +
      '<select name="dial" class="phone-dial" aria-label="Country code"><option value="+971" selected>🇦🇪 +971</option></select>' +
      '<input name="phone" type="tel" class="phone-number" autocomplete="tel-national" inputmode="tel" required placeholder="50 123 4567">' +
      "</span></label>" +
      '<fieldset class="role-field"><legend>I am a</legend>' +
      '<input type="hidden" name="role" value="buyer" data-role-input>' +
      '<span class="role-toggle" role="group" aria-label="I am a">' +
      '<button type="button" class="role-toggle__btn" data-role-pick="broker">Broker</button>' +
      '<button type="button" class="role-toggle__btn is-active" data-role-pick="buyer" aria-pressed="true">Buyer</button>' +
      "</span></fieldset>" +
      '<label class="field"><span>Message</span><textarea name="message" rows="2">' +
      defaultMessage +
      "</textarea></label>" +
      '<label class="hp-field" aria-hidden="true">Website<input name="website" type="text" tabindex="-1" autocomplete="off"></label>' +
      '<p class="form-error" data-form-error hidden></p>' +
      '<button class="btn btn-block" type="submit" data-submit>Register interest</button>' +
      '<p class="form-consent">By registering you agree to be contacted about The Grounds by Aldar and to our <a href="/privacy-policy/">privacy policy</a>.</p>' +
      "</div>" +
      '<div class="form-success enquire-modal__success" data-form-success tabindex="-1" hidden>' +
      "<h3>Thank you for your inquiry.</h3>" +
      "<p>A sales advisor will be in touch with you shortly.</p>" +
      "</div></form>" +
      "</div>";
    document.body.appendChild(root);

    var roleInput = root.querySelector("[data-role-input]");
    root.querySelectorAll("[data-role-pick]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var role = btn.getAttribute("data-role-pick");
        roleInput.value = role;
        root.querySelectorAll("[data-role-pick]").forEach(function (other) {
          var active = other === btn;
          other.classList.toggle("is-active", active);
          other.setAttribute("aria-pressed", active ? "true" : "false");
        });
      });
    });

    root.querySelectorAll("[data-enquire-close]").forEach(function (el) {
      el.addEventListener("click", closeEnquireModal);
    });

    var form = root.querySelector("[data-enquire]");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var name = String(data.get("name") || "").trim();
      var email = String(data.get("email") || "").trim();
      var dial = String(data.get("dial") || "+971").trim();
      var phone = String(data.get("phone") || "").trim();
      var role = String(data.get("role") || "").trim();
      var message = String(data.get("message") || "").trim();
      var err = "";
      if (name.length < 2) err = "Please enter your full name.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err = "Please enter a valid email address.";
      else if (phone.replace(/\D/g, "").length < 7) err = "Please enter a phone number.";
      else if (role !== "broker" && role !== "buyer") err = "Please choose broker or buyer.";
      else if (message.length < 4) err = "Please add a short message.";

      var error = form.querySelector("[data-form-error]");
      var success = form.querySelector("[data-form-success]");
      var fields = form.querySelector("[data-form-fields]");
      var submit = form.querySelector("[data-submit]");
      if (err) {
        error.hidden = false;
        error.textContent = err;
        return;
      }
      error.hidden = true;
      submit.disabled = true;
      submit.textContent = "Sending\u2026";

      fetch("/api/leads/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Same payload shape as offplanproject.ae's register form.
        body: JSON.stringify({
          name: name,
          email: email,
          phone: formatFullPhone(dial, phone),
          project: "The Grounds by Aldar",
          project_slug: "the-grounds-by-aldar",
          source_page: window.location.href,
          traffic_channel: getTrafficChannel(),
          message: message,
          client_type: role === "broker" ? "Broker" : "Buyer",
          inquiry_type: "SEO",
          website: String(data.get("website") || ""),
        }),
      })
        .then(function (res) {
          return res.json().catch(function () { return { ok: false }; }).then(function (json) {
            if (!res.ok || !json.ok) throw new Error(json.message || "We could not send your details. Please try again.");
          });
        })
        .then(function () {
          fields.hidden = true;
          success.hidden = false;
          success.focus();
          // Analytics: no personal data (name, email, phone) ever goes to the dataLayer.
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({
            event: "generate_lead",
            form_name: "register_interest",
            enquire_role: role,
            page_path: window.location.pathname,
          });
          window.dataLayer.push({ event: "enquire_submit", enquire_role: role });
        })
        .catch(function (e) {
          error.hidden = false;
          error.textContent = (e && e.message) || "We could not send your details. Please try again.";
        })
        .then(function () {
          submit.disabled = false;
          submit.textContent = "Register interest";
        });
    });

    return root;
  }

  var modal = mountEnquireModal();

  // Floating "Register interest" button, bottom right on every page.
  (function mountFloatingCta() {
    if (document.querySelector("[data-float-cta]")) return;
    var cta = document.createElement("a");
    cta.href = "#enquire";
    cta.className = "float-cta";
    cta.setAttribute("data-open-enquire", "");
    cta.setAttribute("data-float-cta", "");
    cta.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>' +
      "<span>Register interest</span>";
    document.body.appendChild(cta);
    // Sticky: always on screen (fades in once on load).
    requestAnimationFrame(function () { cta.classList.add("is-visible"); });
  })();
  var lastFocus = null;

  function resetEnquireForm() {
    if (!modal) return;
    var form = modal.querySelector("[data-enquire]");
    if (!form) return;
    var fields = form.querySelector("[data-form-fields]");
    var success = form.querySelector("[data-form-success]");
    var error = form.querySelector("[data-form-error]");
    form.reset();
    if (fields) fields.hidden = false;
    if (success) success.hidden = true;
    if (error) error.hidden = true;
    var message = form.querySelector('textarea[name="message"]');
    if (message) message.value = defaultMessage;
    var roleInput = form.querySelector("[data-role-input]");
    if (roleInput) roleInput.value = "buyer";
    form.querySelectorAll("[data-role-pick]").forEach(function (btn) {
      var buyer = btn.getAttribute("data-role-pick") === "buyer";
      btn.classList.toggle("is-active", buyer);
      btn.setAttribute("aria-pressed", buyer ? "true" : "false");
    });
  }

  function openEnquireModal() {
    if (!modal) modal = mountEnquireModal();
    resetEnquireForm();
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("enquire-open");
    var nameInput = modal.querySelector('input[name="name"]');
    if (nameInput) nameInput.focus();
  }

  function closeEnquireModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("enquire-open");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  document.addEventListener("click", function (event) {
    var opener = event.target.closest("[data-open-enquire], a[href='#enquire']");
    if (!opener) return;
    event.preventDefault();
    closeNav();
    openEnquireModal();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      if (modal && !modal.hidden) {
        closeEnquireModal();
        return;
      }
      closeNav();
    }
  });

  if (window.location.hash === "#enquire") {
    history.replaceState(null, "", window.location.pathname + window.location.search);
    openEnquireModal();
  }

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var nodes = document.querySelectorAll(".reveal");
  if (reduce || !("IntersectionObserver" in window)) {
    nodes.forEach(function (node) {
      node.classList.add("is-in");
    });
    return;
  }
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 }
  );
  nodes.forEach(function (node) {
    observer.observe(node);
  });
})();