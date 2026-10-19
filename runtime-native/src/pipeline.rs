//! Streams 1280-sample int16-scale frames through mel -> embedding -> classifier.
//! Port of runtime-web/src/pipeline.ts; keep the two in step.
use crate::bundle::Bundle;
use ort::{session::Session, value::Tensor};

const MEL_BINS: usize = 32;
const EMB_DIM: usize = 96;
const MEL_WINDOW: usize = 76;
const MEL_CONTEXT: usize = 480;
const WARMUP_SAMPLES: usize = 4 * 16000;

pub struct Pipeline {
    mel_s: Session,
    emb_s: Session,
    clf_s: Session,
    scale: f32,
    offset: f32,
    n: usize,
    prev: Vec<f32>,
    mel: Vec<f32>,
    emb: Vec<Vec<f32>>,
    warm: Vec<Vec<f32>>,
}

fn session(bytes: &[u8]) -> Result<Session, String> {
    Session::builder().and_then(|mut b| b.commit_from_memory(bytes)).map_err(|e| e.to_string())
}

fn run(s: &mut Session, input: &str, shape: Vec<i64>, data: Vec<f32>) -> Result<Vec<f32>, String> {
    let t = Tensor::from_array((shape, data)).map_err(|e| e.to_string())?;
    let out = s.run(ort::inputs![input => t]).map_err(|e| e.to_string())?;
    let (_, v) = out[0].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
    Ok(v.to_vec())
}

impl Pipeline {
    pub fn new(b: &Bundle) -> Result<Self, String> {
        let m = &b.manifest;
        let mut p = Pipeline {
            mel_s: session(&b.melspec)?,
            emb_s: session(&b.embedding)?,
            clf_s: session(&b.classifier)?,
            scale: m.melspec_transform.scale,
            offset: m.melspec_transform.offset,
            n: m.embedding_window,
            prev: vec![0.0; MEL_CONTEXT],
            mel: vec![1.0; MEL_WINDOW * MEL_BINS],
            emb: vec![],
            warm: vec![],
        };
        p.warm = p.warmup()?;
        p.emb = p.warm.clone();
        Ok(p)
    }

    fn melspec(&mut self, x: Vec<f32>) -> Result<Vec<f32>, String> {
        let n = x.len() as i64;
        let (s, o) = (self.scale, self.offset);
        Ok(run(&mut self.mel_s, "input", vec![1, n], x)?.into_iter().map(|v| v * s + o).collect())
    }

    fn embed(&mut self, windows: Vec<f32>, n: usize) -> Result<Vec<f32>, String> {
        run(&mut self.emb_s, "input_1", vec![n as i64, MEL_WINDOW as i64, MEL_BINS as i64, 1], windows)
    }

    /// Upstream primes its embedding history with embeddings of low-level noise; same LCG as the TS runtime.
    fn warmup(&mut self) -> Result<Vec<Vec<f32>>, String> {
        let mut s: u32 = 1;
        let noise: Vec<f32> = (0..WARMUP_SAMPLES)
            .map(|_| {
                s = s.wrapping_mul(1664525).wrapping_add(1013904223);
                (s as f64 / 4294967296.0 * 2000.0 - 1000.0) as f32
            })
            .collect();
        let mel = self.melspec(noise)?;
        let frames = mel.len() / MEL_BINS;
        let starts: Vec<usize> = (0..).step_by(8).take_while(|i| i + MEL_WINDOW <= frames).collect();
        let batch: Vec<f32> = starts.iter().flat_map(|&i| mel[i * MEL_BINS..(i + MEL_WINDOW) * MEL_BINS].to_vec()).collect();
        let out = self.embed(batch, starts.len())?;
        Ok(out.chunks(EMB_DIM).map(|c| c.to_vec()).collect())
    }

    /// `frame`: 1280 samples scaled like int16. Returns the classifier score.
    pub fn push(&mut self, frame: &[f32]) -> Result<f32, String> {
        let mut x = self.prev.clone();
        x.extend_from_slice(frame);
        self.prev = frame[frame.len() - MEL_CONTEXT..].to_vec();

        let frames = self.melspec(x)?;
        self.mel.extend(frames);
        self.mel.drain(..self.mel.len() - MEL_WINDOW * MEL_BINS);

        let e = self.embed(self.mel.clone(), 1)?;
        self.emb.push(e);
        let drop = self.emb.len().saturating_sub(self.n);
        self.emb.drain(..drop);
        let input: Vec<f32> = self.emb.concat();
        let name = self.clf_s.inputs()[0].name().to_string();
        Ok(run(&mut self.clf_s, &name, vec![1, self.n as i64, EMB_DIM as i64], input)?[0])
    }

    pub fn reset(&mut self) {
        self.prev = vec![0.0; MEL_CONTEXT];
        self.mel = vec![1.0; MEL_WINDOW * MEL_BINS];
        self.emb = self.warm.clone();
    }
}
