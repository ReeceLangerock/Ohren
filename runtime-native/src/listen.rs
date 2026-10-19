//! Mic capture loop shared by the CLI and the tray app.
use crate::{bundle::Bundle, detector::Detector, pipeline::Pipeline};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};
use std::time::Duration;

const FRAME: usize = 1280;

pub struct Detection {
    pub score: f32,
    pub t_secs: f64,
}

/// Blocks, listening on the default mic until `stop` is set. Create the stream on this thread (cpal streams are not Send on macOS).
pub fn listen(
    bundle: &Bundle,
    threshold: Option<f32>,
    stop: Arc<AtomicBool>,
    mut on_detect: impl FnMut(Detection),
    mut on_audio: impl FnMut(&[f32]), // every 1280-sample frame, 16 kHz, int16 scale (for apps that record after a detection)
) -> Result<(), Box<dyn std::error::Error>> {
    let m = &bundle.manifest;
    let threshold = threshold.unwrap_or(m.threshold);
    let mut pipeline = Pipeline::new(bundle)?;
    let mut detector = Detector::new(threshold, m.patience_frames, m.cooldown_ms);

    let dev = cpal::default_host().default_input_device().ok_or("no input device")?;
    let cfg = dev.default_input_config()?;
    let (rate, ch) = (cfg.sample_rate() as f64, cfg.channels() as usize);
    let (tx, rx) = mpsc::channel::<Vec<f32>>();
    let stream = dev.build_input_stream(
        cfg.into(),
        move |d: &[f32], _| {
            let _ = tx.send(d.chunks(ch).map(|c| c.iter().sum::<f32>() / ch as f32).collect());
        },
        |e| eprintln!("audio error: {e}"),
        None,
    )?;
    stream.play()?;
    eprintln!("listening for \"{}\" (threshold {threshold}, mic {rate} Hz)", m.phrase);

    // ponytail: linear-interpolation resampler, fine for speech; swap for rubato if aliasing hurts accuracy
    let (step, mut pos) = (rate / 16000.0, 0.0f64);
    let (mut buf, mut out, mut frames) = (Vec::<f32>::new(), Vec::<f32>::new(), 0u64);
    while !stop.load(Ordering::Relaxed) {
        let Ok(chunk) = rx.recv_timeout(Duration::from_millis(200)) else { continue };
        buf.extend(chunk);
        while pos + 1.0 < buf.len() as f64 {
            let i = pos as usize;
            let f = (pos - i as f64) as f32;
            out.push((buf[i] * (1.0 - f) + buf[i + 1] * f) * 32768.0);
            pos += step;
        }
        let used = (pos as usize).min(buf.len()); // pos may point past this chunk; carry the excess
        buf.drain(..used);
        pos -= used as f64;
        while out.len() >= FRAME {
            let frame: Vec<f32> = out.drain(..FRAME).collect();
            on_audio(&frame);
            let score = pipeline.push(&frame)?;
            frames += 1;
            if std::env::var_os("OHREN_DEBUG").is_some() && frames % 12 == 0 {
                eprintln!("peak={:.0} score={score:.2}", frame.iter().fold(0f32, |a, v| a.max(v.abs())));
            }
            let t = frames as f64 * 80.0;
            if detector.update(score, t) {
                on_detect(Detection { score, t_secs: t / 1000.0 });
            }
        }
    }
    Ok(())
}
