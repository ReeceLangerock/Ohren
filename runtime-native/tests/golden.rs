//! Parity with the TS runtime: scores from runtime-web (dumped to golden.json) must match.
use ohren_runtime::{bundle::read_bundle, pipeline::Pipeline};
use std::collections::HashMap;

fn wav(name: &str) -> Vec<f32> {
    let mut r = hound::WavReader::open(format!("../fixtures/{name}.wav")).unwrap();
    r.samples::<i16>().map(|s| s.unwrap() as f32).collect() // int16 scale, as the pipeline expects
}

#[test]
fn scores_match_ts_runtime() {
    let golden: HashMap<String, Vec<f32>> = serde_json::from_slice(&std::fs::read("tests/golden.json").unwrap()).unwrap();
    for (name, want) in golden {
        let b = read_bundle(&std::fs::read("../bundles/hey_jarvis.wakeword").unwrap()).unwrap();
        let mut p = Pipeline::new(&b).unwrap();
        let x = wav(&name);
        let got: Vec<f32> = x.chunks_exact(1280).map(|f| p.push(f).unwrap()).collect();
        assert_eq!(got.len(), want.len(), "{name}: frame count");
        for (i, (g, w)) in got.iter().zip(&want).enumerate() {
            assert!((g - w).abs() < 0.01, "{name} frame {i}: rust {g} vs ts {w}");
        }
    }
}
