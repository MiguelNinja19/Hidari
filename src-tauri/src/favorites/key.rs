use crate::title::{catalog_game_group_key, normalize_title_key};

pub fn is_usable_catalog_key(key: &str) -> bool {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("source:") {
        return false;
    }
    if lower.starts_with("emb_") && !trimmed.contains(' ') {
        return false;
    }
    true
}

pub fn catalog_key_for(title: &str, explicit: Option<&str>) -> String {
    if let Some(key) = explicit
        .map(str::trim)
        .filter(|value| is_usable_catalog_key(value))
    {
        return key.to_string();
    }
    let from_title = catalog_game_group_key(title);
    if !from_title.is_empty() {
        return from_title;
    }
    normalize_title_key(title)
}

pub fn favorite_identity_keys(key: &str, title: &str) -> Vec<String> {
    let mut keys = Vec::new();
    let push = |out: &mut Vec<String>, value: String| {
        if value.is_empty() {
            return;
        }
        if !out.iter().any(|existing| existing == &value) {
            out.push(value);
        }
    };
    push(&mut keys, key.trim().to_string());
    push(&mut keys, catalog_key_for(title, Some(key)));
    push(&mut keys, catalog_game_group_key(title));
    push(&mut keys, normalize_title_key(title));
    keys
}

pub fn row_matches_favorite_identity(
    catalog_key: &str,
    title: &str,
    identities: &[String],
) -> bool {
    let derived = catalog_key_for(title, Some(catalog_key));
    let title_group = catalog_game_group_key(title);
    let title_norm = normalize_title_key(title);
    identities.iter().any(|identity| {
        identity == catalog_key
            || identity == &derived
            || identity == &title_group
            || (!title_norm.is_empty() && identity == &title_norm)
    })
}
