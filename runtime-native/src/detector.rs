/// Fires when the score stays at/above threshold for `patience` consecutive frames,
/// then stays quiet for `cooldown_ms`. Mirrors runtime-web/src/detector.ts.
pub struct Detector {
    pub threshold: f32,
    patience: u32,
    cooldown_ms: f64,
    run: u32,
    quiet_until: f64,
}

impl Detector {
    pub fn new(threshold: f32, patience: u32, cooldown_ms: f64) -> Self {
        Self { threshold, patience, cooldown_ms, run: 0, quiet_until: f64::NEG_INFINITY }
    }

    /// `t_ms` is audio time (end of the frame just scored).
    pub fn update(&mut self, score: f32, t_ms: f64) -> bool {
        if t_ms < self.quiet_until {
            return false;
        }
        self.run = if score >= self.threshold { self.run + 1 } else { 0 };
        if self.run < self.patience {
            return false;
        }
        self.run = 0;
        self.quiet_until = t_ms + self.cooldown_ms;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn needs_patience_consecutive_frames() {
        let mut d = Detector::new(0.5, 2, 1000.0);
        assert!(!d.update(0.9, 80.0));
        assert!(!d.update(0.1, 160.0)); // streak broken
        assert!(!d.update(0.9, 240.0));
        assert!(d.update(0.9, 320.0));
    }

    #[test]
    fn cooldown_suppresses_then_releases() {
        let mut d = Detector::new(0.5, 1, 1000.0);
        assert!(d.update(0.9, 80.0));
        assert!(!d.update(0.9, 500.0));
        assert!(d.update(0.9, 1080.0));
    }
}
