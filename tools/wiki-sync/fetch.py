#!/usr/bin/env python3
"""Fetch Naruto Blazing unit pages (raw wikitext) from the fandom MediaWiki API.

Pages are discovered through the per-element infobox templates
(``Template:Heart Characters`` etc.) plus ``Template:All Characters``;
every unit page transcludes one of them.  Wikitext is fetched 50 pages per
request and cached as ``<cache>/pages/<pageid>.json`` so reruns only hit the
network for pages that are new (or with ``--refresh``).

Stdlib only.  Polite by default: >= 0.35 s between requests, retry with
exponential backoff on network errors / 429 / 5xx, ``maxlag`` and a
descriptive User-Agent.

Usage:
  python3 tools/wiki-sync/fetch.py                  # discover + fetch everything missing
  python3 tools/wiki-sync/fetch.py --refresh        # re-download every page
  python3 tools/wiki-sync/fetch.py --page 5934 9194 # just these page ids
  python3 tools/wiki-sync/fetch.py --search-missing # search the wiki for our units whose
                                                    # card number is not in the cache yet
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://naruto-blazing.fandom.com/api.php"
USER_AGENT = ("NXBNVNB-wiki-sync/1.0 (fan project data sync; "
              "https://naruto-blazing.fandom.com; python-urllib)")
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DEFAULT_CACHE = os.path.join(HERE, ".cache")
DISCOVERY_TEMPLATES = [
    "Template:Heart Characters", "Template:Body Characters",
    "Template:Skill Characters", "Template:Bravery Characters",
    "Template:Wisdom Characters", "Template:All Characters",
]
MIN_INTERVAL = 0.35
_last_request = [0.0]


def api_get(params, retries=6):
    """GET the API with throttling + retries. Returns parsed JSON."""
    params = dict(params, format="json", maxlag="5")
    url = API + "?" + urllib.parse.urlencode(params)
    delay = 1.0
    for attempt in range(retries):
        wait = MIN_INTERVAL - (time.time() - _last_request[0])
        if wait > 0:
            time.sleep(wait)
        _last_request[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.loads(r.read().decode("utf-8"))
            if "error" in data:
                code = data["error"].get("code")
                if code == "maxlag" and attempt < retries - 1:
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise RuntimeError("API error: %s" % data["error"])
            return data
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                retry_after = e.headers.get("Retry-After") if e.headers else None
                time.sleep(float(retry_after) if retry_after and retry_after.isdigit() else delay)
                delay *= 2
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError):
            if attempt < retries - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise
    raise RuntimeError("unreachable")


def discover(log=print):
    """Return {pageid: title} for every page transcluding a character template."""
    pages = {}
    for tpl in DISCOVERY_TEMPLATES:
        cont = {}
        n = 0
        while True:
            data = api_get(dict({"action": "query", "list": "embeddedin", "eititle": tpl,
                                 "einamespace": 0, "eilimit": 500}, **cont))
            for p in data["query"]["embeddedin"]:
                pages[str(p["pageid"])] = p["title"]
                n += 1
            if "continue" not in data:
                break
            cont = data["continue"]
        log("  %-32s %4d pages" % (tpl, n))
    return pages


def cache_paths(cache):
    pages_dir = os.path.join(cache, "pages")
    os.makedirs(pages_dir, exist_ok=True)
    return pages_dir, os.path.join(cache, "index.json")


def load_index(cache):
    _, idx = cache_paths(cache)
    if os.path.exists(idx):
        with open(idx, encoding="utf-8") as f:
            return json.load(f)
    return {"pages": {}, "discovered_at": None}


def save_index(cache, index):
    _, idx = cache_paths(cache)
    with open(idx, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)


def fetch_pages(pageids, cache, refresh=False, log=print):
    """Download wikitext for pageids (50 per request) into the cache."""
    pages_dir, _ = cache_paths(cache)
    todo = [p for p in pageids
            if refresh or not os.path.exists(os.path.join(pages_dir, "%s.json" % p))]
    log("fetching %d page(s) (%d already cached)" % (len(todo), len(pageids) - len(todo)))
    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        data = api_get({"action": "query", "prop": "revisions", "rvprop": "ids|timestamp|content",
                        "rvslots": "main", "pageids": "|".join(chunk)})
        for pid, page in data["query"]["pages"].items():
            if "missing" in page or not page.get("revisions"):
                continue
            rev = page["revisions"][0]
            text = rev.get("slots", {}).get("main", {}).get("*", rev.get("*", ""))
            rec = {"pageid": page["pageid"], "title": page["title"], "revid": rev.get("revid"),
                   "timestamp": rev.get("timestamp"), "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "wikitext": text}
            with open(os.path.join(pages_dir, "%s.json" % pid), "w", encoding="utf-8") as f:
                json.dump(rec, f, ensure_ascii=False)
        log("  %d/%d" % (min(i + 50, len(todo)), len(todo)))
    return todo


def iter_cached(cache):
    pages_dir, _ = cache_paths(cache)
    for fn in sorted(os.listdir(pages_dir)):
        if fn.endswith(".json"):
            with open(os.path.join(pages_dir, fn), encoding="utf-8") as f:
                yield json.load(f)


def search_missing(cache, characters_path, log=print):
    """Search the wiki for our units whose card number is not in any cached page."""
    sys.path.insert(0, HERE)
    import parse as wparse  # noqa: E402
    have = set()
    for rec in iter_cached(cache):
        r = wparse.parse_page(rec)
        if r and r.get("card_no") is not None:
            have.add(r["card_no"])
    with open(characters_path, encoding="utf-8") as f:
        units = json.load(f)
    found = {}
    missing = [u for u in units if wparse.card_from_id(u["id"]) not in have]
    log("searching wiki for %d unit(s) whose card # is not cached" % len(missing))
    for u in missing:
        q = '"%s" "%s"' % (u.get("name", ""), u.get("version", ""))
        data = api_get({"action": "query", "list": "search", "srsearch": q, "srlimit": 5, "srnamespace": 0})
        for hit in data["query"]["search"]:
            found[str(hit["pageid"])] = hit["title"]
    return found


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", default=DEFAULT_CACHE, help="cache dir (default tools/wiki-sync/.cache)")
    ap.add_argument("--refresh", action="store_true", help="re-download pages already cached")
    ap.add_argument("--rediscover", action="store_true", help="re-run page discovery even if index exists")
    ap.add_argument("--page", nargs="*", help="only fetch these page ids")
    ap.add_argument("--search-missing", action="store_true",
                    help="search the wiki for units in characters.json whose card # is not cached")
    ap.add_argument("--characters", default=os.path.join(REPO, "data", "characters.json"))
    a = ap.parse_args(argv)

    index = load_index(a.cache)
    if a.page:
        fetch_pages([str(p) for p in a.page], a.cache, refresh=a.refresh)
        return 0
    if a.rediscover or not index["pages"]:
        print("discovering unit pages ...")
        index["pages"] = discover()
        index["discovered_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        save_index(a.cache, index)
        print("discovered %d pages" % len(index["pages"]))
    fetch_pages(sorted(index["pages"], key=int), a.cache, refresh=a.refresh)
    if a.search_missing:
        extra = search_missing(a.cache, a.characters)
        new = {k: v for k, v in extra.items() if k not in index["pages"]}
        print("search found %d new candidate page(s)" % len(new))
        if new:
            index["pages"].update(new)
            save_index(a.cache, index)
            fetch_pages(sorted(new, key=int), a.cache)
    return 0


if __name__ == "__main__":
    sys.exit(main())
