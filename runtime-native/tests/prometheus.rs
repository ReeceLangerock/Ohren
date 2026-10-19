//! Smoke test of the real prometheus bundle on synthesized speech. Skipped unless OHREN_CLIPS points at a dir with p_*.wav / n.wav.
use ohren_runtime::{bundle::read_bundle, detector::Detector, pipeline::Pipeline};

fn hits(clip: &str) -> usize {
    let b = read_bundle(&std::fs::read("../bundles/prometheus.wakeword").unwrap()).unwrap();
    let m = &b.manifest;
    let mut p = Pipeline::new(&b).unwrap();
    let mut d = Detector::new(m.threshold, m.patience_frames, m.cooldown_ms);
    let mut x: Vec<f32> = hound::WavReader::open(clip).unwrap().samples::<i16>().map(|s| s.unwrap() as f32).collect();
    x.resize(x.len() + 16000, 0.0); // trailing silence so the window fills
    x.chunks_exact(1280).enumerate().filter(|(i, f)| d.update(p.push(f).unwrap(), (*i + 1) as f64 * 80.0)).count()
}

#[test]
fn prometheus_fires_on_phrase_not_on_speech() {
    let Ok(dir) = std::env::var("OHREN_CLIPS") else { return };
    for v in ["Samantha", "Daniel"] {
        assert_eq!(hits(&format!("{dir}/p_{v}.wav")), 1, "{v}");
    }
    assert_eq!(hits(&format!("{dir}/n.wav")), 0);
}
