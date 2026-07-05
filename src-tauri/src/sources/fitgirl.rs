use crate::catalog::{normalize_match_text, title_matches_query};
use crate::config;
use crate::dto::{CatalogGameDto, DownloadOptionDto, HydraSourceDto};
use crate::title;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::time::Duration;
use url::Url;

pub fn is_fitgirl_source(source: &HydraSourceDto) -> bool {
  let url = source.url.to_lowercase();
  let name = source.name.to_lowercase();
  url.contains("fitgirl") || name.contains("fitgirl")
}

pub fn fitgirl_base_url(source: &HydraSourceDto) -> String {
  let lower = source.url.to_lowercase();
  if lower.contains(&config::FITGIRL_SITE_URL.replace("https://", "")) {
    return config::FITGIRL_SITE_URL.to_string();
  }
  config::FITGIRL_SITE_URL.to_string()
}
pub async fn search_fitgirl_options(
  client: &reqwest::Client,
  source: &HydraSourceDto,
  query: &str,
) -> Vec<DownloadOptionDto> {
  let search_term = title::simplify_source_search_query(query);
  let base = fitgirl_base_url(source);
  let search_response = client
    .get(format!("{base}/"))
    .query(&[("s", search_term.as_str())])
    .send()
    .await;
  let Ok(search_response) = search_response else {
    return Vec::new();
  };
  if !search_response.status().is_success() {
    return Vec::new();
  }
  let search_html = match search_response.text().await {
    Ok(body) => body,
    Err(_) => return Vec::new(),
  };

  let post_links: Vec<String> = extract_fitgirl_post_links(&search_html)
    .into_iter()
    .filter(|url| !is_fitgirl_noise_post(url, ""))
    .take(8)
    .collect();
  if post_links.is_empty() {
    return Vec::new();
  }

  let mut options: Vec<DownloadOptionDto> = Vec::new();
  let mut seen_btih = HashSet::new();
  for post_url in post_links {
    let post_response = client.get(&post_url).send().await;
    let Ok(post_response) = post_response else {
      continue;
    };
    if !post_response.status().is_success() {
      continue;
    }
    let post_html = match post_response.text().await {
      Ok(body) => body,
      Err(_) => continue,
    };

    let title = extract_fitgirl_title(&post_html).unwrap_or_else(|| search_term.clone());
    if is_fitgirl_noise_post(&post_url, &title) || !title_matches_query(&title, query) {
      continue;
    }

    let post_cover = extract_fitgirl_cover_image(&post_html);
    let magnets = extract_labeled_magnets(&post_html);
    for (magnet, label) in magnets {
      let btih = magnet_btih(&magnet);
      if let Some(hash) = &btih {
        if !seen_btih.insert(hash.clone()) {
          continue;
        }
      }
      options.push(DownloadOptionDto {
        source_id: source.id.clone(),
        source_name: source.name.clone(),
        title: title.clone(),
        download_type: "torrent".to_string(),
        url: magnet,
        quality: label,
        cover_url: post_cover.clone(),
      });
    }
    if options.len() >= 12 {
      break;
    }
  }

  options
}

fn decode_html_entities(value: &str) -> String {
  value
    .replace("&#038;", "&")
    .replace("&#39;", "'")
    .replace("&quot;", "\"")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&amp;", "&")
}

fn magnet_btih(magnet: &str) -> Option<String> {
  let parsed = Url::parse(magnet).ok()?;
  parsed.query_pairs().find_map(|(key, value)| {
    if key == "xt" && value.to_ascii_lowercase().starts_with("urn:btih:") {
      Some(value.to_ascii_lowercase())
    } else {
      None
    }
  })
}

fn magnet_dn_label(magnet: &str) -> Option<String> {
  let parsed = Url::parse(magnet).ok()?;
  for (key, value) in parsed.query_pairs() {
    if key == "dn" {
      let label = decode_html_entities(value.trim());
      if !label.is_empty() {
        return Some(label);
      }
    }
  }
  None
}

fn label_before_magnet(html: &str, magnet: &str) -> Option<String> {
  let idx = html.find(magnet)?;
  let start = idx.saturating_sub(180);
  let window = &html[start..idx];
  static HOST: OnceLock<Regex> = OnceLock::new();
  let re = HOST.get_or_init(|| {
    Regex::new(
      r"(?i)(1337x|fuckingfast|fucking fast|torrage|rutor|rustork|tapochek|online-fix|linux|macos|windows)",
    )
    .expect("fitgirl host label regex must compile")
  });
  re.captures_iter(window).last().and_then(|cap| {
    cap
      .get(1)
      .map(|m| {
        let raw = m.as_str();
        if raw.eq_ignore_ascii_case("fucking fast") {
          "FuckingFast".to_string()
        } else {
          raw.to_string()
        }
      })
  })
}

pub fn extract_labeled_magnets(html: &str) -> Vec<(String, String)> {
  let magnets = dedupe_magnets(extract_magnet_links(html));
  let mut out = Vec::new();
  for (index, magnet) in magnets.into_iter().enumerate() {
    let label = label_before_magnet(html, &magnet)
      .or_else(|| magnet_dn_label(&magnet))
      .map(|value| {
        if value.len() > 52 {
          format!("{}…", &value[..49])
        } else {
          value
        }
      })
      .unwrap_or_else(|| format!("Magnet {}", index + 1));
    out.push((magnet, label));
  }
  out
}
pub(crate) struct SourceProbeCache {
  entries: HashMap<String, (bool, u64)>,
}

impl SourceProbeCache {
  fn get(&self, key: &str) -> Option<bool> {
    const TTL_MS: u64 = 30 * 60 * 1000;
    let now = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|duration| duration.as_millis())
      .unwrap_or(0) as u64;
    let (hit, at) = self.entries.get(key)?;
    if now.saturating_sub(*at) > TTL_MS {
      return None;
    }
    Some(*hit)
  }

  fn put(&mut self, key: String, hit: bool) {
    let now = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|duration| duration.as_millis())
      .unwrap_or(0) as u64;
    self.entries.insert(key, (hit, now));
  }
}

pub fn source_probe_cache() -> &'static Mutex<SourceProbeCache> {
  static CACHE: OnceLock<Mutex<SourceProbeCache>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(SourceProbeCache {
    entries: HashMap::new(),
  }))
}

pub fn source_probe_cache_get(key: &str) -> Option<bool> {
  source_probe_cache()
    .lock()
    .ok()
    .and_then(|cache| cache.get(key))
}

pub fn source_probe_cache_put(key: String, hit: bool) {
  if let Ok(mut cache) = source_probe_cache().lock() {
    cache.put(key, hit);
  }
}
fn fitgirl_slug_title(url: &str) -> String {
  let slug = url.trim_end_matches('/').rsplit('/').next().unwrap_or("");
  slug.replace('-', " ")
}

pub async fn quick_fitgirl_has_sources(client: &reqwest::Client, game_title: &str) -> bool {
  let cache_key = normalize_match_text(game_title);
  if cache_key.is_empty() {
    return false;
  }
  if let Some(hit) = source_probe_cache_get(&cache_key) {
    return hit;
  }

  let search_term = title::simplify_source_search_query(game_title);
  if search_term.trim().len() < 2 {
    source_probe_cache_put(cache_key, false);
    return false;
  }

  let base = config::FITGIRL_SITE_URL;
  let search_response = client
    .get(format!("{base}/"))
    .query(&[("s", search_term.as_str())])
    .send()
    .await;
  let Ok(search_response) = search_response else {
    return false;
  };
  if !search_response.status().is_success() {
    source_probe_cache_put(cache_key, false);
    return false;
  }
  let search_html = match search_response.text().await {
    Ok(body) => body,
    Err(_) => {
      source_probe_cache_put(cache_key, false);
      return false;
    }
  };

  let post_links: Vec<String> = extract_fitgirl_post_links(&search_html)
    .into_iter()
    .filter(|url| !is_fitgirl_noise_post(url, ""))
    .take(6)
    .collect();

  for post_url in post_links {
    let slug_title = fitgirl_slug_title(&post_url);
    if !title_matches_query(&slug_title, game_title) {
      continue;
    }

    let post_response = client.get(&post_url).send().await;
    let Ok(post_response) = post_response else {
      continue;
    };
    if !post_response.status().is_success() {
      continue;
    }
    let post_html = match post_response.text().await {
      Ok(body) => body,
      Err(_) => continue,
    };

    let title = extract_fitgirl_title(&post_html).unwrap_or(slug_title);
    if is_fitgirl_noise_post(&post_url, &title) || !title_matches_query(&title, game_title) {
      continue;
    }
    if extract_magnet_links(&post_html).is_empty() {
      continue;
    }

    source_probe_cache_put(cache_key.clone(), true);
    return true;
  }

  source_probe_cache_put(cache_key, false);
  false
}
async fn game_has_active_sources(
  client: &reqwest::Client,
  sources: &[HydraSourceDto],
  game_title: &str,
) -> bool {
  for source in sources {
    if !is_fitgirl_source(source) {
      continue;
    }
    if quick_fitgirl_has_sources(client, game_title).await {
      return true;
    }
  }
  false
}

pub async fn filter_catalog_with_sources(
  games: Vec<CatalogGameDto>,
  sources: &[HydraSourceDto],
) -> Vec<CatalogGameDto> {
  if games.is_empty() || sources.is_empty() {
    return Vec::new();
  }

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(8))
    .cookie_store(true)
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Hydra-Tauri-Launcher")
    .build()
    .unwrap_or_else(|_| reqwest::Client::new());

  let client = Arc::new(client);
  let mut filtered = Vec::new();

  for chunk in games.chunks(3) {
    let mut handles = Vec::new();
    for game in chunk {
      let client = client.clone();
      let title = game.title.clone();
      let sources = sources.to_vec();
      handles.push(tauri::async_runtime::spawn(async move {
        let has_source = game_has_active_sources(&client, &sources, &title).await;
        (title, has_source)
      }));
    }

    for handle in handles {
      let Ok((title, has_source)) = handle.await else {
        continue;
      };
      if !has_source {
        continue;
      }
      if let Some(game) = chunk.iter().find(|row| row.title == title) {
        filtered.push(game.clone());
      }
    }
  }

  filtered
}
fn is_fitgirl_noise_post(url: &str, title: &str) -> bool {
  let url_l = url.to_lowercase();
  let title_l = title.to_lowercase();
  url_l.contains("updates-digest")
    || url_l.contains("/category/")
    || url_l.contains("/tag/")
    || url_l.contains("/author/")
    || url_l.contains("/popular-repacks")
    || url_l.contains("/all-my-repacks")
    || title_l.starts_with("updates digest")
    || title_l.contains("digest for ")
}

pub fn dedupe_magnets(magnets: Vec<String>) -> Vec<String> {
  let mut seen = HashSet::new();
  let mut out = Vec::new();
  for magnet in magnets {
    let key = magnet.to_lowercase();
    if seen.insert(key) {
      out.push(magnet);
    }
  }
  out
}

pub fn extract_fitgirl_post_links(html: &str) -> Vec<String> {
  let title_link_re = Regex::new(
    r#"<h[12][^>]*class="[^"]*entry-title[^"]*"[^>]*>\s*<a[^>]*href="(https?://fitgirl-repacks\.site/[^"]+)""#,
  )
  .expect("fitgirl title link regex must compile");
  let fallback_re = Regex::new(r#"href="(https?://fitgirl-repacks\.site/[a-z0-9][a-z0-9-]*/?)""#)
    .expect("fitgirl fallback link regex must compile");
  let mut links: Vec<String> = Vec::new();

  for captures in title_link_re.captures_iter(html) {
    let Some(url_match) = captures.get(1) else {
      continue;
    };
    push_fitgirl_post_link(&mut links, url_match.as_str());
  }

  if links.is_empty() {
    for captures in fallback_re.captures_iter(html) {
      let Some(url_match) = captures.get(1) else {
        continue;
      };
      push_fitgirl_post_link(&mut links, url_match.as_str());
    }
  }

  links
}

pub fn push_fitgirl_post_link(links: &mut Vec<String>, raw_url: &str) {
  let url = raw_url.to_string();
  if url.contains("/wp-content/")
    || url.contains("/feed/")
    || url.contains("/search/")
    || url.contains("/tag/")
    || url.contains("/category/")
    || url.contains("/author/")
    || url.contains("/comments/")
    || url.ends_with(".js")
    || url.ends_with(".css")
    || is_fitgirl_noise_post(&url, "")
  {
    return;
  }
  if !links.contains(&url) {
    links.push(url);
  }
}

pub fn extract_magnet_links(html: &str) -> Vec<String> {
  let magnet_re = Regex::new(r#"magnet:\?xt=urn:[^"'<\s]+"#).expect("magnet regex must compile");
  let mut magnets: Vec<String> = Vec::new();
  for matched in magnet_re.find_iter(html) {
    let magnet = matched
      .as_str()
      .replace("&#038;", "&")
      .replace("&amp;", "&");
    if !magnets.contains(&magnet) {
      magnets.push(magnet);
    }
  }
  magnets
}

pub fn extract_fitgirl_title(html: &str) -> Option<String> {
  let title_re = Regex::new(r#"<title>([^<]+)</title>"#).expect("title regex must compile");
  let captures = title_re.captures(html)?;
  let title = captures.get(1)?.as_str().trim();
  if title.is_empty() {
    None
  } else {
    Some(decode_html_entities(
      title.replace(" - FitGirl Repacks", "").trim(),
    ))
  }
}

pub fn extract_fitgirl_cover_image(html: &str) -> Option<String> {
  static OG_IMAGE: OnceLock<Regex> = OnceLock::new();
  let re = OG_IMAGE.get_or_init(|| {
    Regex::new(r#"(?i)<meta\s+property="og:image"\s+content="([^"]+)""#)
      .expect("og:image regex must compile")
  });
  let url = re.captures(html)?.get(1)?.as_str().trim();
  if url.starts_with("http") && !url.to_lowercase().contains("logo") {
    Some(url.to_string())
  } else {
    None
  }
}
