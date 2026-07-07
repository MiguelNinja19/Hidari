#!/usr/bin/env python3
"""
Pré-cache rápido de capas — compatível com o launcher Tauri (MyLauncher).

Grava em:
  - %APPDATA%/com.tauri.dev/covers/*.jpg
  - tabela game_covers + cover_precache_skip no launcher.db

Uso (Windows, na pasta do projeto):
  python scripts/precache_covers.py
  python scripts/precache_covers.py --workers 24 --catalog fitgirl.json
  python scripts/precache_covers.py --db "%APPDATA%/com.tauri.dev/launcher.db"

Requisitos: Python 3.10+ (stdlib apenas).
Feche o launcher enquanto roda para evitar conflito no SQLite.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

STEAM_SEARCH_URL = "https://store.steampowered.com/api/storesearch/"
STEAMGRIDDB_API_BASE = "https://www.steamgriddb.com/api/v2"
STEAM_COVER = "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg"
STEAM_COVER_URLS = [
    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg",
    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900_2x.jpg",
    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/header.jpg",
    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/capsule_616x353.jpg",
]

REPACK_NOISE = re.compile(
    r"(?i)\(.*?(fitgirl|repack).*?\)|\[.*?\]|fitgirl[- ]?repack"
    r"|,?\s*builds?\s+[\d/]+|,?\s*\+?\s*\d+\s*dlcs?(?:/bonuses?)?|,?\s*\+?\s*bonuses?",
)
SKIP_RETRY_SECS = 7 * 86400
MIN_IMAGE_BYTES = 256

stats_lock = Lock()
steam_cache_lock = Lock()
steam_query_cache: dict[str, str | None] = {}
sgdb_cache_lock = Lock()
sgdb_query_cache: dict[str, str | None] = {}


@dataclass
class Stats:
    total: int = 0
    skipped_cached: int = 0
    skipped_failed: int = 0
    resolved: int = 0
    downloaded: int = 0
    failed: int = 0
    unresolved: int = 0


def default_app_data() -> Path:
    appdata = os.environ.get("APPDATA") or os.environ.get("HOME", "")
    return Path(appdata) / "com.tauri.dev"


def load_dotenv_file(path: Path) -> None:
    """Carrega variáveis de um .env simples (sem dependências externas)."""
    if not path.is_file():
        return
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def clean_title_for_matching(title: str) -> str:
    base = title.replace("™", "").replace("®", "").replace("©", "")
    stripped = REPACK_NOISE.sub(" ", base)
    collapsed = re.sub(r"\s+", " ", stripped.strip())
    return collapsed or title.strip()


def normalize_title_key(title: str) -> str:
    cleaned = (
        title.lower()
        .replace("™", "")
        .replace("®", "")
        .replace("©", "")
    )
    chars = []
    for ch in cleaned:
        chars.append(ch if ch.isalnum() or ch == " " else " ")
    words = "".join(chars).split()
    return " ".join(words[:6])


def normalize_match_text(value: str) -> str:
    lower = value.lower()
    for ch in ("™", "®", "©", "–", "—", "-", ":", ",", ".", "'", '"', "’"):
        lower = lower.replace(ch, " ")
    filtered = "".join(c if c.isalnum() or c.isspace() else " " for c in lower)
    return " ".join(filtered.split())


def title_word_matches(query_word: str, title_word: str) -> bool:
    if title_word == query_word:
        return True
    return len(query_word) >= 4 and title_word.startswith(query_word)


def title_matches_query(title: str, query: str) -> bool:
    title_words = normalize_match_text(title).split()
    query_words = [w for w in normalize_match_text(query).split() if w]
    if not query_words:
        return True
    for qw in query_words:
        if len(qw) <= 2:
            if not any(tw == qw for tw in title_words):
                return False
        elif not any(title_word_matches(qw, tw) for tw in title_words):
            return False
    return True


def is_likely_dlc(name: str, item_type: str = "", type_label: str = "") -> bool:
    n = name.lower()
    if any(
        x in n
        for x in (
            " dlc",
            "dlc ",
            "soundtrack",
            " ost",
            "season pass",
            "expansion pass",
            "skin pack",
            "cosmetic pack",
            "booster pack",
        )
    ):
        return True
    if item_type.lower() == "dlc" or "dlc" in type_label.lower():
        return True
    return False


def load_embedded_catalog(repo_root: Path) -> list[dict]:
    path = repo_root / "src-tauri" / "resources" / "embedded_catalog.json"
    if not path.is_file():
        return []
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def embedded_cover_for_title(title: str, embedded: list[dict]) -> str | None:
    cleaned = clean_title_for_matching(title)
    for candidate in (cleaned, title):
        for entry in embedded:
            if title_matches_query(entry.get("title", ""), candidate):
                app_id = entry.get("steam_app_id")
                if app_id:
                    return STEAM_COVER.format(app_id=app_id)

    title_norm = normalize_match_text(cleaned)
    if not title_norm:
        return None
    best: tuple[int, int] | None = None
    for entry in embedded:
        app_id = entry.get("steam_app_id")
        if not app_id:
            continue
        entry_norm = normalize_match_text(entry.get("title", ""))
        if not entry_norm:
            continue
        if title_norm not in entry_norm and entry_norm not in title_norm:
            continue
        score = len(entry_norm)
        if best is None or score > best[0]:
            best = (score, int(app_id))
    if best:
        return STEAM_COVER.format(app_id=best[1])
    return None


STATUS_SEP = "\x1f"


def encode_status(kind: str, url: str, path: str | None = None) -> str:
    """Codifica resultado sem usar ':' (URLs https:// quebram split(':') )."""
    if path is None:
        return f"{kind}{STATUS_SEP}{url}"
    return f"{kind}{STATUS_SEP}{url}{STATUS_SEP}{path}"


def decode_status(status: str) -> tuple[str, str, str | None]:
    parts = status.split(STATUS_SEP, 2)
    if len(parts) == 1:
        return parts[0], "", None
    if len(parts) == 2:
        return parts[0], parts[1], None
    return parts[0], parts[1], parts[2]


def is_plausible_cover_url(url: str) -> bool:
    trimmed = url.strip()
    return len(trimmed) >= 12 and (
        trimmed.startswith("http://") or trimmed.startswith("https://")
    )


def http_get_json(url: str, timeout: float = 12.0, headers: dict[str, str] | None = None) -> dict | None:
    req_headers = {"User-Agent": "Mozilla/5.0 Hydra-Cover-Precache/1.0"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        return None


def simplify_source_search_query(title: str) -> str:
    cleaned = title.replace("™", "").replace("®", "").replace("©", "").strip()
    head = cleaned.split(":")[0].split(" - ")[0].strip()
    return head or cleaned


def steam_search_queries_for_title(title: str) -> list[str]:
    out: list[str] = []
    cleaned = clean_title_for_matching(title)
    if len(cleaned) >= 2:
        out.append(cleaned)
    simple = simplify_source_search_query(title)
    if len(simple) >= 2:
        out.append(simple)
    words = cleaned.split()
    if len(words) > 4:
        out.append(" ".join(words[:4]))
    if len(words) > 2:
        out.append(" ".join(words[:2]))
    seen: set[str] = set()
    unique: list[str] = []
    for query in out:
        key = normalize_match_text(query)
        if key and key not in seen:
            seen.add(key)
            unique.append(query)
    return unique


def score_steam_title_match(steam_title: str, reference_norm: str) -> int:
    if not reference_norm:
        return 0
    steam_norm = normalize_match_text(steam_title)
    if not steam_norm:
        return 0
    if steam_norm == reference_norm:
        return 100
    if reference_norm in steam_norm or steam_norm in reference_norm:
        return 50
    ref_words = [w for w in reference_norm.split() if len(w) > 2]
    steam_words = steam_norm.split()
    return sum(
        1
        for word in ref_words
        if any(title_word_matches(word, sw) for sw in steam_words)
    )


def load_steam_app_index(
    conn: sqlite3.Connection,
) -> tuple[dict[str, int], dict[str, list[tuple[str, int]]]]:
    """Carrega o índice local `steam_app_index` (populado pelo app Rust) em memória.

    Retorna (exato: name_norm -> app_id, por_primeira_palavra: palavra -> [(name_norm, app_id)])
    para permitir lookup instantâneo (exato + shortlist difuso), igual ao `covers/steam_index.rs`.
    """
    exact: dict[str, int] = {}
    by_first_word: dict[str, list[tuple[str, int]]] = {}
    try:
        rows = conn.execute("SELECT app_id, name_norm FROM steam_app_index").fetchall()
    except sqlite3.OperationalError:
        return exact, by_first_word
    for app_id, name_norm in rows:
        if not name_norm:
            continue
        exact.setdefault(name_norm, int(app_id))
        first_word = name_norm.split(" ", 1)[0]
        if first_word:
            by_first_word.setdefault(first_word, []).append((name_norm, int(app_id)))
    return exact, by_first_word


def steam_app_index_cover_url_for_title(
    title: str,
    index_exact: dict[str, int],
    index_by_first_word: dict[str, list[tuple[str, int]]],
) -> str | None:
    """Resolve a capa via índice local (sem rede) — mesma lógica de `steam_index::lookup_steam_app_id_local`."""
    if not index_exact and not index_by_first_word:
        return None

    queries = steam_search_queries_for_title(title)
    if not queries:
        return None

    for query in queries:
        norm = normalize_match_text(query)
        if norm and norm in index_exact:
            return STEAM_COVER.format(app_id=index_exact[norm])

    reference_norm = normalize_match_text(clean_title_for_matching(title))
    if not reference_norm:
        return None
    words = reference_norm.split()
    if not words:
        return None
    first_word = next((w for w in words if len(w) >= 4), words[0])

    candidates = index_by_first_word.get(first_word, [])
    best: tuple[int, int] | None = None
    for name_norm, app_id in candidates:
        score = score_steam_title_match(name_norm, reference_norm)
        if score >= 2 and (best is None or score > best[0]):
            best = (score, app_id)
    if best:
        return STEAM_COVER.format(app_id=best[1])
    return None


def steam_cover_url_for_title(title: str) -> str | None:
    queries = steam_search_queries_for_title(title)
    if not queries:
        return None
    reference_norm = normalize_match_text(clean_title_for_matching(title))
    cache_key = reference_norm
    with steam_cache_lock:
        if cache_key in steam_query_cache:
            return steam_query_cache[cache_key]

    best_fuzzy: tuple[int, str] | None = None
    resolved: str | None = None

    for cleaned in queries:
        query = urllib.parse.urlencode({"term": cleaned, "cc": "US", "l": "en"})
        data = http_get_json(f"{STEAM_SEARCH_URL}?{query}")
        if not data or not isinstance(data.get("items"), list):
            continue
        for item in data["items"][:24]:
            app_id = item.get("id")
            name = (item.get("name") or "").strip()
            if not app_id or not name:
                continue
            item_type = item.get("type") or ""
            type_label = item.get("type_label") or ""
            if is_likely_dlc(name, str(item_type), str(type_label)):
                continue
            if title_matches_query(name, cleaned):
                resolved = STEAM_COVER.format(app_id=int(app_id))
                break
            score = score_steam_title_match(name, reference_norm)
            if score >= 2 and (best_fuzzy is None or score > best_fuzzy[0]):
                best_fuzzy = (score, STEAM_COVER.format(app_id=int(app_id)))
        if resolved:
            break

    if not resolved and best_fuzzy:
        resolved = best_fuzzy[1]

    with steam_cache_lock:
        steam_query_cache[cache_key] = resolved
    return resolved


def encode_autocomplete_term(term: str) -> str:
    return urllib.parse.quote(term, safe="")


def steamgriddb_grid_url(client_headers: dict[str, str], game_id: int) -> str | None:
    url = (
        f"{STEAMGRIDDB_API_BASE}/grids/game/{game_id}"
        "?dimensions=600x900&types=static"
    )
    data = http_get_json(url, headers=client_headers)
    if not data or not isinstance(data.get("data"), list):
        return None
    for grid in data["data"]:
        image_url = (grid.get("url") or "").strip()
        if image_url:
            return image_url
    return None


def steamgriddb_cover_url_for_title(title: str, api_key: str) -> str | None:
    api_key = api_key.strip()
    if not api_key:
        return None

    queries = steam_search_queries_for_title(title)
    if not queries:
        return None

    reference_norm = normalize_match_text(clean_title_for_matching(title))
    cache_key = reference_norm
    with sgdb_cache_lock:
        if cache_key in sgdb_query_cache:
            return sgdb_query_cache[cache_key]

    headers = {"Authorization": f"Bearer {api_key}"}
    best_fuzzy: tuple[int, int] | None = None
    resolved: str | None = None

    for search_term in queries:
        encoded = encode_autocomplete_term(search_term)
        data = http_get_json(
            f"{STEAMGRIDDB_API_BASE}/search/autocomplete/{encoded}",
            headers=headers,
        )
        if not data or not isinstance(data.get("data"), list):
            continue
        for item in data["data"][:20]:
            game_id = item.get("id")
            name = (item.get("name") or "").strip()
            if not game_id or not name:
                continue
            if title_matches_query(name, search_term):
                resolved = steamgriddb_grid_url(headers, int(game_id))
                break
            score = score_steam_title_match(name, reference_norm)
            if score >= 2 and (best_fuzzy is None or score > best_fuzzy[0]):
                best_fuzzy = (score, int(game_id))
        if resolved:
            break

    if not resolved and best_fuzzy:
        resolved = steamgriddb_grid_url(headers, best_fuzzy[1])

    with sgdb_cache_lock:
        sgdb_query_cache[cache_key] = resolved
    return resolved


def load_steamgriddb_api_key(conn: sqlite3.Connection) -> str | None:
    row = conn.execute(
        "SELECT value FROM app_settings WHERE key = 'steamgriddb_api_key'"
    ).fetchone()
    if not row:
        return None
    value = (row[0] or "").strip()
    return value or None


def cover_file_name(title_key: str, cover_url: str) -> str:
    digest = hashlib.sha256(f"{title_key}\0{cover_url}".encode("utf-8")).hexdigest()[:16]
    return f"{digest}.jpg"


def is_valid_image(data: bytes) -> bool:
    if len(data) < MIN_IMAGE_BYTES:
        return False
    if data[:3] == b"\xff\xd8\xff":
        return True
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if data[:4] == b"RIFF" and len(data) >= 12 and data[8:12] == b"WEBP":
        return True
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return True
    return False


def download_cover_bytes(cover_url: str, timeout: float = 20.0) -> bytes | None:
    app_id_match = re.search(r"/steam/apps/(\d+)/", cover_url)
    urls = [cover_url]
    if app_id_match:
        app_id = app_id_match.group(1)
        urls = [u.format(app_id=app_id) for u in STEAM_COVER_URLS] + urls

    seen: set[str] = set()
    for url in urls:
        if url in seen:
            continue
        seen.add(url)
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "MyLauncher/1.0", "Accept": "image/*"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status != 200:
                    continue
                data = resp.read()
                if is_valid_image(data):
                    return data
        except (urllib.error.URLError, TimeoutError):
            continue
    return None


def now_unix() -> int:
    return int(time.time())


def load_titles_from_db(conn: sqlite3.Connection) -> list[str]:
    cur = conn.execute(
        "SELECT DISTINCT title FROM hydra_catalog_entries ORDER BY title COLLATE NOCASE"
    )
    return [row[0] for row in cur.fetchall()]


def load_titles_from_json(path: Path) -> list[str]:
    raw = json.loads(path.read_text(encoding="utf-8-sig"))
    downloads = raw if isinstance(raw, list) else raw.get("downloads") or raw.get("repacks") or []
    titles: list[str] = []
    seen: set[str] = set()
    for item in downloads:
        if not isinstance(item, dict):
            continue
        title = (item.get("title") or "").strip()
        if not title:
            continue
        key = normalize_title_key(title)
        if key and key not in seen:
            seen.add(key)
            titles.append(title)
    return titles


def is_plausible_local_cover_path(path: str, covers_dir: Path) -> bool:
    trimmed = path.strip()
    if not trimmed:
        return False
    if "://" in trimmed or ".jpg:" in trimmed.lower() or ".png:" in trimmed.lower():
        return False
    p = Path(trimmed)
    if not p.is_absolute():
        return False
    if trimmed.startswith("\\\\"):
        leaf = covers_dir.name.lower()
        if f"\\{leaf}\\" not in trimmed.lower():
            return False
    return True


def get_cached_keys(conn: sqlite3.Connection, covers_dir: Path) -> set[str]:
    keys: set[str] = set()
    for title_key, local_path in conn.execute(
        "SELECT title_key, local_path FROM game_covers WHERE local_path IS NOT NULL"
    ):
        if not local_path:
            continue
        if not is_plausible_local_cover_path(local_path, covers_dir):
            conn.execute(
                "UPDATE game_covers SET local_path = NULL WHERE title_key = ?",
                (title_key,),
            )
            continue
        p = Path(local_path)
        try:
            if p.is_file() and p.stat().st_size >= MIN_IMAGE_BYTES:
                keys.add(title_key)
        except OSError:
            conn.execute(
                "UPDATE game_covers SET local_path = NULL WHERE title_key = ?",
                (title_key,),
            )
    conn.commit()
    return keys


def should_skip_resolve(conn: sqlite3.Connection, title_key: str) -> bool:
    row = conn.execute(
        "SELECT tried_at FROM cover_precache_skip WHERE title_key = ?",
        (title_key,),
    ).fetchone()
    if not row:
        return False
    return now_unix() - int(row[0]) < SKIP_RETRY_SECS


def upsert_cover(conn: sqlite3.Connection, title_key: str, cover_url: str, local_path: str | None) -> None:
    conn.execute(
        """
        INSERT INTO game_covers (title_key, cover_url, local_path, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(title_key) DO UPDATE SET
          cover_url = excluded.cover_url,
          local_path = COALESCE(excluded.local_path, game_covers.local_path),
          updated_at = CURRENT_TIMESTAMP
        """,
        (title_key, cover_url, local_path),
    )


def mark_skip(conn: sqlite3.Connection, title_key: str) -> None:
    conn.execute(
        """
        INSERT INTO cover_precache_skip (title_key, tried_at) VALUES (?, ?)
        ON CONFLICT(title_key) DO UPDATE SET tried_at = excluded.tried_at
        """,
        (title_key, now_unix()),
    )


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS game_covers (
          title_key   TEXT PRIMARY KEY,
          cover_url   TEXT NOT NULL,
          local_path  TEXT,
          updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS cover_precache_skip (
          title_key TEXT PRIMARY KEY,
          tried_at  INTEGER NOT NULL
        );
        """
    )


@dataclass
class WorkItem:
    title: str
    title_key: str


def process_item(
    item: WorkItem,
    covers_dir: Path,
    embedded: list[dict],
    use_steam: bool,
    sgdb_api_key: str | None,
    known_urls: dict[str, str],
    steam_index_exact: dict[str, int],
    steam_index_by_first_word: dict[str, list[tuple[str, int]]],
) -> tuple[str, str]:
    """Retorna (title_key, status)."""
    title_key = item.title_key

    url = known_urls.get(title_key) or embedded_cover_for_title(item.title, embedded)
    if not url:
        url = steam_app_index_cover_url_for_title(
            item.title, steam_index_exact, steam_index_by_first_word
        )
    if not url and use_steam:
        url = steam_cover_url_for_title(item.title)
    if not url and sgdb_api_key:
        url = steamgriddb_cover_url_for_title(item.title, sgdb_api_key)
    if not url:
        return title_key, "unresolved"

    file_path = covers_dir / cover_file_name(title_key, url)
    if file_path.is_file() and file_path.stat().st_size >= MIN_IMAGE_BYTES:
        return title_key, encode_status("cached", url, str(file_path))

    data = download_cover_bytes(url)
    if not data:
        return title_key, encode_status("failed", url)

    file_path.write_bytes(data)
    return title_key, encode_status("downloaded", url, str(file_path))


def main() -> int:
    parser = argparse.ArgumentParser(description="Pré-cache de capas para o MyLauncher")
    parser.add_argument(
        "--db",
        type=Path,
        default=None,
        help="Caminho do launcher.db (padrão: %%APPDATA%%/com.tauri.dev/launcher.db)",
    )
    parser.add_argument(
        "--covers-dir",
        type=Path,
        default=None,
        help="Pasta covers (padrão: ao lado do .db)",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=None,
        help="JSON do catálogo (ex.: fitgirl.json) — ignora títulos só do SQLite",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=16,
        help="Downloads paralelos (padrão: 16)",
    )
    parser.add_argument(
        "--no-steam",
        action="store_true",
        help="Só catálogo embutido (sem API Steam)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Processar no máximo N títulos (0 = todos)",
    )
    parser.add_argument(
        "--sgdb-key",
        type=str,
        default=None,
        help="Chave API SteamGridDB (ou lê de app_settings no .db)",
    )
    parser.add_argument(
        "--retry-failed",
        action="store_true",
        help="Limpa a lista de «sem capa» e tenta de novo (use após melhorar o matcher)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Só lista quantos títulos seriam processados",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    load_dotenv_file(repo_root / ".env")
    app_data = default_app_data()
    db_path = args.db or (app_data / "launcher.db")
    covers_dir = args.covers_dir or (app_data / "covers")

    if not db_path.is_file() and not args.catalog:
        print(f"Erro: banco não encontrado: {db_path}", file=sys.stderr)
        print("Use --catalog fitgirl.json ou importe um catálogo no launcher.", file=sys.stderr)
        return 1

    embedded = load_embedded_catalog(repo_root)
    titles: list[str] = []

    if args.catalog:
        if not args.catalog.is_file():
            print(f"Erro: catálogo não encontrado: {args.catalog}", file=sys.stderr)
            return 1
        titles = load_titles_from_json(args.catalog)
        print(f"Catálogo JSON: {len(titles)} títulos únicos")
    elif db_path.is_file():
        conn = sqlite3.connect(db_path)
        ensure_schema(conn)
        titles = load_titles_from_db(conn)
        conn.close()
        print(f"SQLite: {len(titles)} títulos em hydra_catalog_entries")

    if args.limit > 0:
        titles = titles[: args.limit]

    covers_dir.mkdir(parents=True, exist_ok=True)

    cached_keys: set[str] = set()
    skip_keys: set[str] = set()
    known_urls: dict[str, str] = {}
    steam_index_exact: dict[str, int] = {}
    steam_index_by_first_word: dict[str, list[tuple[str, int]]] = {}
    sgdb_api_key: str | None = (
        (args.sgdb_key or "").strip()
        or os.environ.get("STEAMGRIDDB_API_KEY", "").strip()
        or None
    )
    if db_path.is_file():
        conn = sqlite3.connect(db_path)
        ensure_schema(conn)
        if args.retry_failed:
            removed = conn.execute("DELETE FROM cover_precache_skip").rowcount
            conn.commit()
            print(f"Lista «sem capa» limpa ({removed} entradas) — nova tentativa habilitada.")
        cached_keys = get_cached_keys(conn, covers_dir)
        for row in conn.execute("SELECT title_key, cover_url FROM game_covers"):
            if is_plausible_cover_url(row[1]):
                known_urls[row[0]] = row[1]
        for row in conn.execute("SELECT title_key, tried_at FROM cover_precache_skip"):
            key, tried_at = row
            if now_unix() - int(tried_at) < SKIP_RETRY_SECS:
                skip_keys.add(key)
        if not sgdb_api_key:
            sgdb_api_key = load_steamgriddb_api_key(conn)
        steam_index_exact, steam_index_by_first_word = load_steam_app_index(conn)
        removed_bad_urls = conn.execute(
            "DELETE FROM game_covers WHERE length(cover_url) < 12 "
            "OR (cover_url NOT LIKE 'http://%' AND cover_url NOT LIKE 'https://%')"
        ).rowcount
        if removed_bad_urls:
            conn.commit()
            print(f"URLs inválidas removidas do banco: {removed_bad_urls}")
        conn.close()

    work: list[WorkItem] = []
    for title in titles:
        key = normalize_title_key(title)
        if not key or key in cached_keys or key in skip_keys:
            continue
        work.append(WorkItem(title=title, title_key=key))

    stats = Stats(total=len(work))
    already_done = len(titles) - len(work)

    print(f"Pasta capas: {covers_dir}")
    print(f"Banco:       {db_path if db_path.is_file() else '(será criado)'}")
    print(f"Índice Steam local: {len(steam_index_exact)} jogos indexados" if steam_index_exact else "Índice Steam local: vazio (abra o launcher para atualizá-lo)")
    print(f"SteamGridDB: {'sim' if sgdb_api_key else 'não (configure em Configurações ou --sgdb-key)'}")
    print(f"A processar: {len(work)} títulos ({args.workers} workers)")
    print(f"Já em cache / ignorados: {already_done}")
    if args.dry_run:
        print("Dry-run — nada será baixado.")
        return 0

    if not work:
        print("Nada a fazer — capas já em cache ou marcadas como falha recente.")
        return 0

    use_steam = not args.no_steam
    db_lock = Lock()
    conn = sqlite3.connect(db_path, check_same_thread=False)
    ensure_schema(conn)

    started = time.time()
    processed = 0
    on_disk = 0

    def handle_result(result: tuple[str, str]) -> None:
        nonlocal processed, on_disk
        title_key, status = result
        with db_lock:
            kind, url, path = decode_status(status)
            if kind == "cached" and path and is_plausible_cover_url(url):
                upsert_cover(conn, title_key, url, path)
                on_disk += 1
            elif kind == "downloaded" and path and is_plausible_cover_url(url):
                upsert_cover(conn, title_key, url, path)
                stats.downloaded += 1
            elif kind == "failed":
                stats.failed += 1
            elif status == "unresolved":
                mark_skip(conn, title_key)
                stats.unresolved += 1
            conn.commit()

        processed += 1
        if processed % 50 == 0 or processed == len(work):
            elapsed = max(time.time() - started, 0.001)
            rate = processed / elapsed
            print(
                f"  [{processed}/{len(work)}] "
                f"baixadas={stats.downloaded} "
                f"no disco={on_disk} "
                f"sem capa={stats.unresolved} "
                f"falha={stats.failed} "
                f"({rate:.1f}/s)",
                flush=True,
            )

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [
            pool.submit(
                process_item,
                item,
                covers_dir,
                embedded,
                use_steam,
                sgdb_api_key,
                known_urls,
                steam_index_exact,
                steam_index_by_first_word,
            )
            for item in work
        ]
        for fut in as_completed(futures):
            try:
                handle_result(fut.result())
            except Exception as exc:
                print(f"Erro inesperado: {exc}", file=sys.stderr)

    conn.close()
    elapsed = time.time() - started
    print()
    print("Concluído em {:.1f} min".format(elapsed / 60))
    print(f"  Baixadas:       {stats.downloaded}")
    print(f"  Já no disco:    {on_disk}")
    print(f"  Sem capa:       {stats.unresolved}")
    print(f"  Falha download: {stats.failed}")
    print("Reabra o launcher — Explorar usará as capas locais.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
