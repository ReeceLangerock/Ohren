use serde::Deserialize;
use std::io::{Cursor, Read};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format_version: u32,
    pub name: String,
    pub phrase: String,
    pub sample_rate: u32,
    pub frame_samples: u32,
    pub embedding_window: usize,
    pub melspec_transform: Transform,
    pub threshold: f32,
    pub patience_frames: u32,
    pub cooldown_ms: f64,
    pub models: Models,
}

#[derive(Debug, Deserialize)]
pub struct Transform {
    pub scale: f32,
    pub offset: f32,
}

#[derive(Debug, Deserialize)]
pub struct Models {
    pub melspec: String,
    pub embedding: String,
    pub classifier: String,
}

pub struct Bundle {
    pub manifest: Manifest,
    pub melspec: Vec<u8>,
    pub embedding: Vec<u8>,
    pub classifier: Vec<u8>,
}

/// Same checks as runtime-web/src/manifest.ts.
pub fn parse_manifest(json: &str) -> Result<Manifest, String> {
    let m: Manifest = serde_json::from_str(json).map_err(|e| format!("Invalid bundle manifest: {e}"))?;
    if m.format_version != 1 {
        return Err(format!("Unsupported bundle formatVersion {}; this runtime supports 1", m.format_version));
    }
    if m.sample_rate != 16000 || m.frame_samples != 1280 {
        return Err("Invalid bundle: only 16 kHz audio with 1280-sample frames is supported".into());
    }
    Ok(m)
}

pub fn read_bundle(bytes: &[u8]) -> Result<Bundle, String> {
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("Invalid bundle zip: {e}"))?;
    let mut file = |name: &str| -> Result<Vec<u8>, String> {
        let mut f = zip.by_name(name).map_err(|_| format!("Invalid bundle: {name} missing"))?;
        let mut v = Vec::new();
        f.read_to_end(&mut v).map_err(|e| e.to_string())?;
        Ok(v)
    };
    let manifest = parse_manifest(&String::from_utf8(file("manifest.json")?).map_err(|e| e.to_string())?)?;
    Ok(Bundle {
        melspec: file(&manifest.models.melspec)?,
        embedding: file(&manifest.models.embedding)?,
        classifier: file(&manifest.models.classifier)?,
        manifest,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const BUNDLE: &str = "../bundles/prometheus.wakeword";

    #[test]
    fn reads_prometheus_bundle_unchanged() {
        let b = read_bundle(&std::fs::read(BUNDLE).unwrap()).unwrap();
        assert_eq!(b.manifest.name, "prometheus");
        assert_eq!(b.manifest.threshold, 0.75);
        assert!(b.melspec.len() > 1000 && b.embedding.len() > 1000 && b.classifier.len() > 1000);
    }

    #[test]
    fn rejects_unknown_format_version() {
        let json = r#"{"formatVersion":2,"name":"x","phrase":"x","sampleRate":16000,"frameSamples":1280,"embeddingWindow":16,
            "melspecTransform":{"scale":0.1,"offset":2},"threshold":0.5,"patienceFrames":2,"cooldownMs":1500,
            "models":{"melspec":"a","embedding":"b","classifier":"c"}}"#;
        assert!(parse_manifest(json).unwrap_err().contains("formatVersion 2"));
    }

    #[test]
    fn rejects_bad_json() {
        assert!(parse_manifest("{").is_err());
    }
}
