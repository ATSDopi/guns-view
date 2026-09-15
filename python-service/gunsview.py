"""
gunsview — sends a real view to a guns.lol profile using a real browser (nodriver).
The browser's JS resolves PoW + Turnstile natively. We just click "click to enter".

Verifies the view actually counted by intercepting the POST /api/analytics/view
request and checking its HTTP response status.
"""
import asyncio
import json
import os
import platform
import random
import sys
import time

import nodriver as uc
from nodriver import cdp
import secrets


def _resolve_proxy_session(proxy_url):
    """Replace {session} placeholder in proxy URL with a random token.
    Residential proxy providers (IPRoyal, PIA, etc.) use session IDs to
    assign different exit IPs: password_session-{id} → new IP each time."""
    if not proxy_url or "{session}" not in proxy_url:
        return proxy_url
    session_id = secrets.token_hex(8)
    return proxy_url.replace("{session}", session_id)


def _normalize_nodriver_obj(obj):
    """Convert nodriver's serialized object format {type, value: [[k, {type, value}], ...]} to a plain dict."""
    if isinstance(obj, dict) and "value" in obj and isinstance(obj["value"], list):
        normalized = {}
        for pair in obj["value"]:
            if isinstance(pair, list) and len(pair) == 2:
                key = pair[0]
                val = pair[1]
                if isinstance(val, dict) and "value" in val:
                    normalized[key] = val["value"]
                else:
                    normalized[key] = val
        return normalized
    return obj if isinstance(obj, dict) else {}


def _normalize_nodriver_list(raw):
    """Convert nodriver's serialized list format to a list of plain dicts."""
    if not raw:
        return []
    result = []
    if isinstance(raw, list):
        for item in raw:
            result.append(_normalize_nodriver_obj(item))
    return result


def _find_chrome() -> str:
    if os.environ.get("CHROME_PATH"):
        return os.environ["CHROME_PATH"]
    if platform.system() == "Windows":
        candidates = [
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ]
    else:
        candidates = [
            "/usr/bin/google-chrome-stable",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
        ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    raise FileNotFoundError("Chrome/Edge not found. Set CHROME_PATH env var.")


def _get_profile_dir(worker_id: int = 0) -> str:
    if os.environ.get("TS_PROFILE_DIR"):
        return os.environ["TS_PROFILE_DIR"]
    if platform.system() == "Windows":
        base = os.environ.get("TEMP") or os.environ.get("TMP") or r"C:\Temp"
        return os.path.join(base, f"gunsview_profile_{worker_id}")
    return f"/tmp/gunsview_profile_{worker_id}"


# JS injected before page load — hooks fetch + XHR + sendBeacon to capture the view POST
_VIEW_HOOK_JS = r"""
window.__viewResult = null;
window.__allRequests = [];
(function() {
  function logReq(url, method, status, body) {
    var entry = {url: (url||'').toString().slice(0, 200), method: method, status: status, body: (body||'').slice(0, 200)};
    window.__allRequests.push(entry);
    if (entry.url.includes('/api/analytics/view') || entry.url.includes('analytics')) {
      window.__viewResult = entry;
    }
  }
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const resp = await origFetch.apply(this, args);
    try {
      const url = (args[0]?.url || args[0] || '').toString();
      let body = '';
      try { body = await resp.clone().text(); } catch(e) {}
      logReq(url, 'fetch', resp.status, body);
    } catch(e) {}
    return resp;
  };
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__url = url;
    this.__method = method;
    return origOpen.apply(this, [method, url, ...rest]);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
      logReq(this.__url, 'xhr:' + this.__method, this.status, this.responseText);
    });
    return origSend.apply(this, args);
  };
  const origBeacon = navigator.sendBeacon;
  navigator.sendBeacon = function(url, data) {
    logReq(url, 'beacon', 0, '');
    return origBeacon.apply(this, arguments);
  };
})();
"""


async def _setup_proxy_auth(browser, proxy_url):
    """Handle proxy authentication (user:pass@host:port) via CDP Fetch domain.
    Chrome doesn't accept proxy credentials in the --proxy-server flag for
    SOCKS5, so we answer the auth challenge via CDP."""
    try:
        from urllib.parse import urlparse
        parsed = urlparse(proxy_url)
        if not parsed.username or not parsed.password:
            return None
        username = parsed.username
        password = parsed.password

        async def auth_handler(event):
            if event.authChallenge.source == "Proxy":
                await event.respond(
                    username=username,
                    password=password,
                )
            else:
                await event.continue_request()

        browser.add_handler(cdp.fetch.AuthRequired, auth_handler)
        # enable the Fetch domain to intercept auth challenges
        await browser.send(cdp.fetch.enable(handle_auth_requests=True))
        return auth_handler
    except Exception:
        return None


# error-page detection — Chrome/Edge shows these titles when a proxy or TLS fails
_ERROR_PAGE_SIGNALS = [
    "your connection is not private",
    "your connection isn't secure",
    "connexion n'est pas sécurisée",
    "connexion n'est pas privée",
    "ce site ne peut pas fournir de connexion sécurisée",
    "err_cert_authority_invalid",
    "err_cert_common_name_invalid",
    "err_proxy_connection_failed",
    "err_tunnel_connection_failed",
    "err_name_not_resolved",
    "err_connection_refused",
    "err_connection_reset",
    "err_connection_timed_out",
    "err_proxy_certIFICATE_invalid",
    "err_ssl_protocol_error",
    "err_empty_response",
]


async def _detect_error_page(page) -> str | None:
    """Return a short error code if the page is showing a Chrome/Edge
    connection-error page (proxy dead, TLS MITM, etc.), else None."""
    try:
        text = await page.evaluate(
            "(document.body?.innerText || document.title || '').slice(0, 500).toLowerCase()"
        )
        if not text:
            return None
        for sig in _ERROR_PAGE_SIGNALS:
            if sig in text:
                return sig
    except Exception:
        pass
    return None


async def _send_view(username: str, timeout: int = 90, worker_id: int = 0, proxy: str = None) -> dict:
    # resolve {session} placeholder → new IP each time
    resolved_proxy = _resolve_proxy_session(proxy) if proxy else None

    browser_args = []
    if resolved_proxy:
        browser_args.append(f"--proxy-server={resolved_proxy}")
        # proxies (especially free/MITM ones) often present untrusted TLS certs
        # when tunneling HTTPS — ignore cert errors so the page actually loads
        browser_args.append("--ignore-certificate-errors")
        browser_args.append("--ignore-ssl-errors")
        # allow auth challenges from proxies to be answered via CDP
        browser_args.append("--disable-web-security")

    browser = await uc.start(
        browser_executable_path=_find_chrome(),
        headless=False,
        user_data_dir=_get_profile_dir(worker_id),
        lang="en-US",
        browser_args=browser_args,
    )

    # handle proxy authentication (user:pass@host:port) via CDP Fetch domain
    proxy_auth_handler = None
    if resolved_proxy and "@" in resolved_proxy:
        proxy_auth_handler = _setup_proxy_auth(browser, resolved_proxy)

    try:
        siteurl = f"https://guns.lol/{username}"
        page = await browser.get(siteurl)

        # inject the view-hook JS as early as possible
        try:
            await page.evaluate(_VIEW_HOOK_JS)
        except Exception:
            # page might not be ready yet — retry after a short wait
            await asyncio.sleep(1.0)
            try:
                await page.evaluate(_VIEW_HOOK_JS)
            except Exception:
                pass

        # wait for the page to load
        await asyncio.sleep(random.uniform(2.0, 4.0))

        # early bail: if the proxy is dead/MITM, the browser shows an error page
        # instead of guns.lol — detect it and fail fast (don't waste 90s)
        err = await _detect_error_page(page)
        if err:
            return {
                "ok": False,
                "error": f"proxy_error:{err}",
                "username": username,
                "worker_id": worker_id,
            }

        # inject the view-hook JS
        try:
            await page.evaluate(_VIEW_HOOK_JS)
        except Exception:
            pass

        # simulate human mouse movements (helps with bot detection)
        for _ in range(random.randint(3, 6)):
            x = random.uniform(200, 600)
            y = random.uniform(150, 450)
            await page.mouse_move(x, y)
            await asyncio.sleep(random.uniform(0.05, 0.2))

        # bring the browser window to the foreground (needed for real mouse clicks)
        try:
            await page.send(cdp.page.bring_to_front())
        except Exception:
            pass
        await asyncio.sleep(0.5)

        # find the center of the interstitial element, then do a REAL mouse click
        # real mouse clicks produce isTrusted=true events, which Turnstile requires
        click_coords = None
        try:
            coords = await page.evaluate(r"""
            (function() {
                var els = document.querySelectorAll('a, button, div, span, [role="button"]');
                for (var i = 0; i < els.length; i++) {
                    var el = els[i];
                    var text = (el.innerText || '').toLowerCase();
                    if (text.includes('click to enter')) {
                        var rect = el.getBoundingClientRect();
                        return {x: rect.x + rect.width/2, y: rect.y + rect.height/2};
                    }
                }
                // fallback: click center of viewport
                return {x: window.innerWidth/2, y: window.innerHeight/2};
            })()
            """)
            if coords and isinstance(coords, dict):
                click_coords = coords
        except Exception:
            pass

        if not click_coords:
            click_coords = {"x": 400, "y": 300}

        cx = float(click_coords.get("x", 400))
        cy = float(click_coords.get("y", 300))

        # move mouse to the target with human-like movement, then real click
        await page.mouse_move(cx - 50, cy - 30)
        await asyncio.sleep(random.uniform(0.1, 0.2))
        await page.mouse_move(cx, cy)
        await asyncio.sleep(random.uniform(0.08, 0.15))
        await page.mouse_click(cx, cy)

        # wait for the view POST to fire and complete
        deadline = time.time() + timeout
        view_result = None
        interstitial_gone = False

        while time.time() < deadline:
            # bail early if the page flipped to a connection-error page
            err = await _detect_error_page(page)
            if err:
                return {
                    "ok": False,
                    "error": f"proxy_error:{err}",
                    "username": username,
                    "worker_id": worker_id,
                }

            # check if the view POST was captured in __allRequests
            try:
                raw_reqs = await page.evaluate("window.__allRequests || []")
                if raw_reqs:
                    reqs = _normalize_nodriver_list(raw_reqs)
                    for req in reqs:
                        url = req.get("url", "")
                        if "analytics/view" in url or ("analytics" in url and req.get("status", 0) >= 200):
                            view_result = req
                            await asyncio.sleep(1.0)
                            break
            except Exception:
                pass
            if view_result:
                break

            # also check if interstitial is gone (backup signal)
            try:
                text = await page.evaluate("document.body?.innerText?.slice(0, 200) || ''")
                if text and "click to enter" not in text.lower():
                    interstitial_gone = True
            except Exception:
                pass

            await asyncio.sleep(1.0)

        # if we didn't capture the POST but interstitial is gone, wait more
        if not view_result and interstitial_gone:
            # give the page time to send the POST after the click
            for _ in range(10):
                try:
                    raw_reqs = await page.evaluate("window.__allRequests || []")
                    if raw_reqs:
                        reqs = _normalize_nodriver_list(raw_reqs)
                        for req in reqs:
                            url = req.get("url", "")
                            if "analytics/view" in url or ("analytics" in url and req.get("status", 0) >= 200):
                                view_result = req
                                break
                except Exception:
                    pass
                if view_result:
                    break
                await asyncio.sleep(1.0)

        if view_result:
            status = view_result.get("status", 0)
            ok = status >= 200 and status < 300
            return {
                "ok": ok,
                "username": username,
                "worker_id": worker_id,
                "view_status": status,
                "view_method": view_result.get("method"),
                "view_body": view_result.get("body", "")[:200],
            }
        else:
            # dump all captured requests for debugging
            all_reqs = []
            try:
                raw_reqs = await page.evaluate("window.__allRequests || []")
                all_reqs = _normalize_nodriver_list(raw_reqs)
            except Exception:
                pass
            return {
                "ok": False,
                "error": "no /api/analytics/view request captured",
                "interstitial_gone": interstitial_gone,
                "username": username,
                "worker_id": worker_id,
                "all_requests": all_reqs,
            }
    finally:
        browser.stop()


def send_view(username: str, timeout: int = 90, worker_id: int = 0, proxy: str = None) -> dict:
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return asyncio.run(_send_view(username, timeout, worker_id, proxy))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python gunsview.py <username> [worker_id]")
        sys.exit(1)
    username = sys.argv[1]
    worker_id = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    result = send_view(username, worker_id=worker_id)
    print(json.dumps(result))
