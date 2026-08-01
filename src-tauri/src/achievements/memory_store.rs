//! In-memory store for scanned achievements.
//!
//! Mirrors Hydra's `AchievementMemoryStore`. Keyed by `shop:object_id`.
//! Not persisted to disk — achievements are re-scanned on each app launch.

use super::AchievementData;
use std::collections::HashMap;
use std::sync::Mutex;

pub struct AchievementMemoryStore {
  inner: Mutex<HashMap<String, AchievementData>>,
}

impl Default for AchievementMemoryStore {
  fn default() -> Self {
    Self {
      inner: Mutex::new(HashMap::new()),
    }
  }
}

impl AchievementMemoryStore {
  pub fn new() -> Self {
    Self::default()
  }

  fn make_key(shop: &str, object_id: &str) -> String {
    format!("{shop}:{object_id}")
  }

  pub fn get(&self, shop: &str, object_id: &str) -> Option<AchievementData> {
    let key = Self::make_key(shop, object_id);
    self.inner.lock().ok()?.get(&key).cloned()
  }

  pub fn set(&self, shop: &str, object_id: &str, data: AchievementData) {
    let key = Self::make_key(shop, object_id);
    if let Ok(mut map) = self.inner.lock() {
      map.insert(key, data);
    }
  }

  pub fn clear(&self) {
    if let Ok(mut map) = self.inner.lock() {
      map.clear();
    }
  }
}
