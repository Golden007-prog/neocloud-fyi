// Build guard for the corrections form's Cloudflare Turnstile widget.
// The widget renders only when meta.feedback_url is set. If it renders with an empty
// meta.turnstile_sitekey, the captcha is dead and every reader correction is rejected,
// so the build must fail instead . Used by eleventy.config.mjs.

/** Throws if `html` contains a Turnstile widget whose data-sitekey is empty or unset. */
export function assertTurnstileKey(html, pagePath = "(page)") {
  const widgets = html.match(/<div[^>]*class="[^"]*cf-turnstile[^"]*"[^>]*>/g) ?? [];
  for (const tag of widgets) {
    const key = /data-sitekey="([^"]*)"/.exec(tag)?.[1] ?? "";
    if (key.trim() === "" || key.trim() === "undefined") {
      throw new Error(
        `${pagePath}: Turnstile widget rendered with an empty site key. ` +
          `Set turnstile_sitekey in site/data/meta.yml, or leave feedback_url empty.`,
      );
    }
  }
}
