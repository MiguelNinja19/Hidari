use std::sync::Mutex;

#[derive(Default)]
pub struct SidecarState {
  port: Mutex<Option<u16>>,
  booting: Mutex<bool>,
}

#[derive(Default)]
pub struct ExtractionState {
  busy: Mutex<bool>,
}

impl ExtractionState {
  pub fn try_acquire(&self) -> bool {
    let mut guard = self.busy.lock().unwrap();
    if *guard {
      return false;
    }
    *guard = true;
    true
  }

  pub fn release(&self) {
    *self.busy.lock().unwrap() = false;
  }
}

impl SidecarState {
  pub fn get_port(&self) -> Option<u16> {
    *self.port.lock().unwrap()
  }

  pub fn set_port(&self, port: u16) {
    *self.port.lock().unwrap() = Some(port);
  }

  pub fn clear_port(&self) {
    *self.port.lock().unwrap() = None;
  }

  pub fn is_booting(&self) -> bool {
    *self.booting.lock().unwrap()
  }

  pub fn set_booting(&self, booting: bool) {
    *self.booting.lock().unwrap() = booting;
  }
}
